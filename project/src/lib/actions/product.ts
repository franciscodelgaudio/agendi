"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { findManagedUnit } from "@/lib/unit-access"
import type { Permission } from "@/lib/permissions"
import {
  createProduct,
  deleteProduct,
  depleteProduct,
  updateProduct,
  type CreateProductError,
  type UpdateProductError,
} from "@/lib/product"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { findUnitProducts } from "@/lib/product-lookup"
import { productScopeMatch, type ProductScope } from "@/lib/product-scope"
import { PRODUCT_SEARCH_LIMIT, productSearchPipeline } from "@/lib/product-search"
import { recordStockPurchase } from "@/lib/stock-purchase"
import { setUnitQuantity, transferProduct, type TransferProductError } from "@/lib/stock-movement"
import { findUnitStock, recordMovement, scopeOf, type UnitStock } from "@/lib/stock-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Product } from "@/models/Product"
import type { ProductOption } from "@/components/product-picker"

const errorMessages: Record<
  CreateProductError | UpdateProductError | TransferProductError | "out_of_stock" | "conflict" | "unauthenticated",
  string
> = {
  invalid_input: "Preencha nome, quantidade e preço de custo.",
  invalid_name: "Informe o nome do produto.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_quantity: "Informe a quantidade como número inteiro, entre 0 e 1.000.000.",
  invalid_cost: "Informe um preço de custo entre R$ 0,00 e R$ 1.000.000,00, com até 2 casas decimais.",
  notes_too_long: "As observações podem ter no máximo 500 caracteres.",
  invalid_rating: "A avaliação deve ser de 1 a 5 estrelas.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  product_not_found: "Produto não encontrado ou sem permissão.",
  out_of_stock: "A quantidade deste produto já é zero. Atualize o estoque antes de marcar que acabou.",
  invalid_units: "Escolha unidades deste estoque.",
  same_unit: "Escolha uma unidade de destino diferente da de origem.",
  not_distributed: "Este estoque é compartilhado: a quantidade é uma só para todas as unidades.",
  insufficient_stock: "A unidade de origem não tem essa quantidade do produto.",
  conflict: "O estoque deste produto mudou enquanto você editava. Tente de novo.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ProductActionState = { error: string | null }

// Unidade (se o usuário tiver a permissão nela), o estoque em que ela está e os produtos que
// ela enxerga; undefined sem permissão, null = sessão expirada.
async function findManagedTarget(workspaceId: string, unitId: string, permission: Permission = "stock.manage") {
  const userId = await getSessionUserId()
  if (!userId) return null
  const unit = await findManagedUnit(workspaceId, unitId, userId, permission)
  if (!unit) return { userId, unit: undefined }
  const stock = await findUnitStock(unit.unitId)
  return { userId, unit: { unitId: unit.unitId, stock, scope: scopeOf(unit.unitId, stock) } }
}

// Aumento de estoque vira despesa paga no grupo de insumos, criado se a unidade ainda não tiver.
async function recordPurchase(userId: string, change: Parameters<typeof recordStockPurchase>[0]) {
  await recordStockPurchase(change, {
    ensureGroup: async (unitId, name) => {
      const icons = await loadExpenseGroupIcons()
      const iconId = (icons.find((icon) => icon.key === "package") ?? icons[0]).id
      const group = await ExpenseGroup.findOneAndUpdate(
        { unitId, name },
        { $setOnInsert: { unitId, name, monthlyLimitCents: null, iconId } },
        { upsert: true, returnDocument: "after", collation: { locale: "pt", strength: 1 } },
      )
        .select({ _id: 1 })
        .lean()
      return group!._id.toString()
    },
    insert: (data) => Expense.create({ ...data, createdBy: userId }),
    now: new Date(),
  })
}

// Entrada vira compra (com despesa), saída vira ajuste; as duas ficam no histórico da unidade.
async function recordQuantityChange(
  userId: string,
  unitId: string,
  stock: UnitStock | null,
  change: { productId: string; productName: string; previousQuantity: number; quantity: number; costCents: number },
) {
  const delta = change.quantity - change.previousQuantity
  await Promise.all([
    recordPurchase(userId, { ...change, unitId }),
    recordMovement({
      productId: change.productId,
      stockId: stock?.id ?? null,
      unitId,
      kind: delta >= 0 ? "purchase" : "adjustment",
      quantity: Math.abs(delta),
      createdBy: userId,
    }),
  ])
}

function productInput(formData: FormData) {
  return {
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    cost: formData.get("cost"),
    notes: formData.get("notes"),
    rating: formData.get("rating"),
    avatarUrl: formData.get("avatarUrl"),
  }
}

// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
// Num estoque distribuído, a quantidade informada é a da unidade; as outras começam em zero.
export async function createProductAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId, unit } = target

  const result = await createProduct(productInput(formData), unit?.unitId, async (data) => {
    const stock = unit!.stock
    const quantities = stock?.distributed
      ? setUnitQuantity(
          { quantity: 0, unitQuantities: stock.unitIds.map((id) => ({ unitId: id, quantity: 0 })) },
          data.unitId,
          data.quantity,
        )
      : null
    const product = await Product.create({
      ...data,
      stockId: stock?.id ?? null,
      unitQuantities: quantities?.unitQuantities ?? [],
    })
    const id = product._id.toString()
    await recordQuantityChange(userId, data.unitId, stock, {
      productId: id,
      productName: data.name,
      previousQuantity: 0,
      quantity: data.quantity,
      costCents: data.costCents,
    })
    return { id }
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Só repassa o productId quando a unidade é gerenciável; a escrita ainda filtra pelo escopo
// da unidade para que um produto de fora dele não seja encontrado. null = sessão expirada.
async function resolveProductTarget(
  workspaceId: string,
  unitId: string,
  productId: string,
  permission: Permission = "stock.manage",
) {
  const target = await findManagedTarget(workspaceId, unitId, permission)
  if (!target) return null
  return { ...target, productId: target.unit && isObjectIdOrHexString(productId) ? productId : null }
}

function scopedProduct(id: string, scope: ProductScope) {
  return { _id: new Types.ObjectId(id), ...productScopeMatch(scope) }
}

export async function updateProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId } = target
  let conflict = false

  const result = await updateProduct(productInput(formData), target.productId, async (id, data) => {
    const { unitId: ownedUnitId, stock, scope } = target.unit!
    const filter = scopedProduct(id, scope)
    const change = { productId: id, productName: data.name, costCents: data.costCents }

    if (!stock?.distributed) {
      // Devolve o documento de antes para saber quanto entrou no estoque.
      const previous = await Product.findOneAndUpdate(filter, { $set: data }, { returnDocument: "before" })
        .select({ quantity: 1 })
        .lean()
      if (!previous) return false
      await recordQuantityChange(userId, ownedUnitId, stock, {
        ...change,
        previousQuantity: previous.quantity,
        quantity: data.quantity,
      })
      return true
    }

    // Estoque distribuído: a quantidade do formulário é a da unidade; o total acompanha. A
    // escrita só vale se o total não mudou desde a leitura, senão outra edição se perderia.
    const current = await Product.findOne(filter).select({ quantity: 1, unitQuantities: 1 }).lean()
    if (!current) return false
    const next = setUnitQuantity(
      {
        quantity: current.quantity,
        unitQuantities: current.unitQuantities.map((unit) => ({ unitId: unit.unitId.toString(), quantity: unit.quantity })),
      },
      ownedUnitId,
      data.quantity,
    )
    const { matchedCount } = await Product.updateOne(
      { ...filter, quantity: current.quantity },
      { $set: { ...data, quantity: next.quantity, unitQuantities: next.unitQuantities } },
    )
    if (matchedCount === 0) {
      conflict = true
      return true
    }
    await recordQuantityChange(userId, ownedUnitId, stock, {
      ...change,
      previousQuantity: next.previousQuantity,
      quantity: data.quantity,
    })
    return true
  })

  if (!result.ok) return { error: errorMessages[result.error] }
  if (conflict) return { error: errorMessages.conflict }

  refresh()
  return { error: null }
}

export async function deleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await deleteProduct(target.productId, async (id) => {
    const { deletedCount } = await Product.deleteOne(scopedProduct(id, target.unit!.scope))
    return deletedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Uma unidade do produto acabou: registra a data e tira 1 da quantidade, numa só escrita. No
// estoque distribuído, sai da parte da unidade, que precisa ter pelo menos 1.
export async function depleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId } = target

  const result = await depleteProduct(target.productId, async (id) => {
    const { unitId: ownedUnitId, stock, scope } = target.unit!
    const filter = scopedProduct(id, scope)
    const unitObjectId = new Types.ObjectId(ownedUnitId)
    const { matchedCount } = stock?.distributed
      ? await Product.updateOne(
          { ...filter, unitQuantities: { $elemMatch: { unitId: unitObjectId, quantity: { $gt: 0 } } } },
          {
            $inc: { quantity: -1, "unitQuantities.$[unit].quantity": -1 },
            $push: { depletedAt: new Date() },
          },
          { arrayFilters: [{ "unit.unitId": unitObjectId }] },
        )
      : await Product.updateOne(
          { ...filter, quantity: { $gt: 0 } },
          { $inc: { quantity: -1 }, $push: { depletedAt: new Date() } },
        )
    if (matchedCount > 0) {
      await recordMovement({
        productId: id,
        stockId: stock?.id ?? null,
        unitId: ownedUnitId,
        kind: "depletion",
        quantity: 1,
        createdBy: userId,
      })
      return "depleted"
    }
    const exists = await Product.exists(filter)
    return exists ? "out_of_stock" : "not_found"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Leva produto de uma unidade para outra do mesmo estoque distribuído. unitId é a unidade de
// onde a tela foi aberta, onde o usuário precisa da permissão de transferir.
export async function transferProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId, "stock.transfer")
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId } = target

  const input = { fromUnitId: formData.get("fromUnitId"), toUnitId: formData.get("toUnitId"), quantity: formData.get("quantity") }
  const result = await transferProduct(input, target.productId, async (id, { fromUnitId, toUnitId, quantity }) => {
    const { stock, scope } = target.unit!
    const filter = scopedProduct(id, scope)
    if (!stock?.distributed) return (await Product.exists(filter)) ? "not_distributed" : "not_found"
    if (!stock.unitIds.includes(fromUnitId) || !stock.unitIds.includes(toUnitId)) return "invalid_units"

    const from = new Types.ObjectId(fromUnitId)
    const to = new Types.ObjectId(toUnitId)
    // Unidade que entrou depois no estoque ainda não tem a sua parte; sem ela, o $inc do
    // destino não acharia onde somar.
    await Product.updateOne(
      { ...filter, "unitQuantities.unitId": { $ne: to } },
      { $push: { unitQuantities: { unitId: to, quantity: 0 } } },
    )
    const { matchedCount } = await Product.updateOne(
      { ...filter, unitQuantities: { $elemMatch: { unitId: from, quantity: { $gte: quantity } } } },
      { $inc: { "unitQuantities.$[from].quantity": -quantity, "unitQuantities.$[to].quantity": quantity } },
      { arrayFilters: [{ "from.unitId": from }, { "to.unitId": to }] },
    )
    if (matchedCount === 0) return (await Product.exists(filter)) ? "insufficient_stock" : "not_found"

    await recordMovement({ productId: id, stockId: stock.id, unitId: fromUnitId, kind: "transfer", quantity, toUnitId, createdBy: userId })
    return "transferred"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Busca do seletor de produtos: no máximo PRODUCT_SEARCH_LIMIT do escopo da unidade, só id e nome.
export async function searchProductsAction(workspaceId: string, unitId: string, q: string): Promise<ProductOption[]> {
  if (typeof q !== "string") return []
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target?.unit) return []
  return Product.aggregate<ProductOption>(productSearchPipeline(target.unit.scope, q))
}

// Nomes dos produtos já escolhidos (edição ou padrão do serviço); os excluídos não voltam.
export async function productNamesAction(workspaceId: string, unitId: string, ids: string[]): Promise<ProductOption[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return []
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target?.unit) return []
  return findUnitProducts(target.unit.unitId, ids.slice(0, PRODUCT_SEARCH_LIMIT))
}
