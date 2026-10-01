"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { findManagedUnit } from "@/lib/unit-access"
import { can, type Permission } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import {
  addStockItem,
  createCatalogProduct,
  createProduct,
  deleteProduct,
  depleteProduct,
  updateCatalogProduct,
  updateProduct,
  type AddStockItemResult,
  type CreateCatalogProductResult,
  type CreateProductError,
  type UpdateProductError,
} from "@/lib/product"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { findUnitProducts } from "@/lib/product-lookup"
import { PRODUCT_SEARCH_LIMIT, productSearchPipeline } from "@/lib/product-search"
import { recordStockPurchase } from "@/lib/stock-purchase"
import { transferProduct, type TransferProductError } from "@/lib/stock-movement"
import { findUnitHolder, recordMovement } from "@/lib/stock-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Product } from "@/models/Product"
import { StockItem } from "@/models/StockItem"
import { Unit } from "@/models/Unit"
import type { ProductOption } from "@/components/product-picker"

type AddStockItemError = Extract<AddStockItemResult, { ok: false }>["error"]
type CreateCatalogProductError = Extract<CreateCatalogProductResult, { ok: false }>["error"]

const errorMessages: Record<
  | CreateProductError
  | CreateCatalogProductError
  | UpdateProductError
  | TransferProductError
  | AddStockItemError
  | "out_of_stock"
  | "unauthenticated",
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
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  product_not_found: "Produto não encontrado ou sem permissão.",
  already_in_stock: "Este produto já está no estoque desta unidade.",
  out_of_stock: "A quantidade deste produto já é zero. Atualize o estoque antes de marcar que acabou.",
  invalid_units: "Escolha unidades deste workspace.",
  same_unit: "Escolha uma unidade de destino diferente da de origem.",
  same_stock: "As duas unidades usam o mesmo estoque compartilhado; não há o que transferir.",
  insufficient_stock: "O estoque de origem não tem essa quantidade do produto.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ProductActionState = { error: string | null }

// Unidade (se o usuário tiver a permissão nela), com o workspace e o estoque que ela usa;
// unit undefined sem permissão, null = sessão expirada.
async function findManagedTarget(workspaceId: string, unitId: string, permission: Permission = "stock.manage") {
  const userId = await getSessionUserId()
  if (!userId) return null
  const unit = await findManagedUnit(workspaceId, unitId, userId, permission)
  if (!unit) return { userId, unit: undefined }
  return { userId, unit: { ...unit, ...(await findUnitHolder(unit.unitId)) } }
}

// Aumento de estoque vira despesa paga no grupo de insumos da unidade, criado se ela ainda não tiver.
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

// Entrada vira compra (com despesa da unidade), saída vira ajuste; as duas ficam no histórico.
async function recordQuantityChange(
  userId: string,
  unit: { unitId: string; holderId: string },
  change: { productId: string; productName: string; previousQuantity: number; quantity: number; costCents: number },
) {
  const delta = change.quantity - change.previousQuantity
  await Promise.all([
    recordPurchase(userId, { ...change, unitId: unit.unitId }),
    recordMovement({
      productId: change.productId,
      holderId: unit.holderId,
      unitId: unit.unitId,
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

function isDuplicateKey(error: unknown) {
  return (error as { code?: number })?.code === 11000
}

// Cadastra o produto no catálogo do workspace e já o põe no estoque da unidade com a quantidade.
// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createProductAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId, unit } = target

  const result = await createProduct(productInput(formData), unit?.unitId, async (input) => {
    const { quantity, name, costCents, notes, rating, avatarUrl } = input
    const data = { name, costCents, notes, rating, avatarUrl }
    const product = await Product.create({ ...data, workspaceId: unit!.workspaceId })
    const id = product._id.toString()
    await StockItem.create({ productId: product._id, holderId: unit!.holderId, quantity })
    await recordQuantityChange(userId, unit!, {
      productId: id,
      productName: data.name,
      previousQuantity: 0,
      quantity,
      costCents: data.costCents,
    })
    return { id }
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Põe no estoque da unidade um produto que já está no catálogo.
export async function addStockItemAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId, unit } = target
  if (!unit) return { error: errorMessages.unit_not_found }

  const input = { productId: formData.get("productId"), quantity: formData.get("quantity") }
  const result = await addStockItem(input, async (productId, quantity) => {
    const product = await Product.findOne({ _id: productId, workspaceId: unit.workspaceId })
      .select({ name: 1, costCents: 1 })
      .lean()
    if (!product) return "not_found"
    try {
      await StockItem.create({ productId: product._id, holderId: unit.holderId, quantity })
    } catch (error) {
      if (isDuplicateKey(error)) return "already_in_stock"
      throw error
    }
    await recordQuantityChange(userId, unit, {
      productId,
      productName: product.name,
      previousQuantity: 0,
      quantity,
      costCents: product.costCents,
    })
    return "added"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Só repassa o productId quando a unidade é gerenciável; as escritas filtram pelo estoque da
// unidade (e pelo workspace, no catálogo). null = sessão expirada.
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

function stockItemOf(holderId: string, productId: string) {
  return { holderId: new Types.ObjectId(holderId), productId: new Types.ObjectId(productId) }
}

// Edita o produto no catálogo e a quantidade no estoque da unidade; só o produto que está nele.
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

  const result = await updateProduct(productInput(formData), target.productId, async (id, { quantity, ...data }) => {
    const unit = target.unit!
    // Devolve o item de antes para saber quanto entrou no estoque.
    const previous = await StockItem.findOneAndUpdate(
      stockItemOf(unit.holderId, id),
      { $set: { quantity } },
      { returnDocument: "before" },
    )
      .select({ quantity: 1 })
      .lean()
    if (!previous) return false
    await Product.updateOne({ _id: id, workspaceId: unit.workspaceId }, { $set: data })
    await recordQuantityChange(userId, unit, {
      productId: id,
      productName: data.name,
      previousQuantity: previous.quantity,
      quantity,
      costCents: data.costCents,
    })
    return true
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Tira o produto do estoque da unidade; ele continua no catálogo e nos outros estoques.
export async function deleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await deleteProduct(target.productId, async (id) => {
    const { deletedCount } = await StockItem.deleteOne(stockItemOf(target.unit!.holderId, id))
    return deletedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Uma unidade do produto acabou no estoque da unidade: registra a data e tira 1 da quantidade,
// numa só escrita.
export async function depleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }
  const { userId } = target

  const result = await depleteProduct(target.productId, async (id) => {
    const unit = target.unit!
    const item = stockItemOf(unit.holderId, id)
    const { matchedCount } = await StockItem.updateOne(
      { ...item, quantity: { $gt: 0 } },
      { $inc: { quantity: -1 }, $push: { depletedAt: new Date() } },
    )
    if (matchedCount === 0) return (await StockItem.exists(item)) ? "out_of_stock" : "not_found"
    await recordMovement({ productId: id, holderId: unit.holderId, unitId: unit.unitId, kind: "depletion", quantity: 1, createdBy: userId })
    return "depleted"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Leva produto do estoque de uma unidade para o de outra do workspace. unitId é a unidade de
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
    const { workspaceId: ownedWorkspaceId } = target.unit!
    const units = await Unit.countDocuments({ _id: { $in: [fromUnitId, toUnitId] }, workspaceId: ownedWorkspaceId })
    if (units < 2) return "invalid_units"
    const [from, to] = await Promise.all([findUnitHolder(fromUnitId), findUnitHolder(toUnitId)])
    if (from.holderId === to.holderId) return "same_stock"

    const { matchedCount } = await StockItem.updateOne(
      { ...stockItemOf(from.holderId, id), quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
    )
    if (matchedCount === 0) {
      return (await StockItem.exists(stockItemOf(from.holderId, id))) ? "insufficient_stock" : "not_found"
    }
    // O destino ganha o item se ainda não tiver o produto.
    await StockItem.updateOne(
      stockItemOf(to.holderId, id),
      { $inc: { quantity }, $setOnInsert: { depletedAt: [] } },
      { upsert: true },
    )
    await recordMovement({
      productId: id,
      holderId: from.holderId,
      unitId: fromUnitId,
      kind: "transfer",
      quantity,
      toUnitId,
      createdBy: userId,
    })
    return "transferred"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Id do workspace se o usuário gerenciar o estoque nele; undefined sem permissão, null = sessão expirada.
async function resolveCatalogWorkspace(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access && can(access.actor, "stock.manage") ? access.id : undefined }
}

// Cadastro no catálogo (tela de produtos do workspace), sem pôr em nenhum estoque.
export async function createCatalogProductAction(
  workspaceId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveCatalogWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await createCatalogProduct(productInput(formData), target.workspaceId, async (data) => {
    const product = await Product.create(data)
    return { id: product._id.toString() }
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Edição no catálogo (tela de produtos do workspace): os dados do produto, sem quantidade.
export async function updateCatalogProductAction(
  workspaceId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveCatalogWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(productId) ? productId : null
  const result = await updateCatalogProduct(productInput(formData), id, async (productId, data) => {
    const { matchedCount } = await Product.updateOne({ _id: productId, workspaceId: target.workspaceId }, { $set: data })
    return matchedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Exclui o produto do catálogo e de todos os estoques.
export async function deleteCatalogProductAction(workspaceId: string, productId: string): Promise<ProductActionState> {
  const target = await resolveCatalogWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(productId) ? productId : null
  const result = await deleteProduct(id, async (productId) => {
    const { deletedCount } = await Product.deleteOne({ _id: productId, workspaceId: target.workspaceId })
    if (deletedCount === 0) return false
    await StockItem.deleteMany({ productId })
    return true
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Busca do seletor de produtos: no máximo PRODUCT_SEARCH_LIMIT do catálogo, só id e nome.
export async function searchProductsAction(workspaceId: string, unitId: string, q: string): Promise<ProductOption[]> {
  if (typeof q !== "string") return []
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target?.unit) return []
  return Product.aggregate<ProductOption>(productSearchPipeline(target.unit.workspaceId, q))
}

// Nomes dos produtos já escolhidos (edição ou padrão do serviço); os excluídos não voltam.
export async function productNamesAction(workspaceId: string, unitId: string, ids: string[]): Promise<ProductOption[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return []
  const target = await findManagedTarget(workspaceId, unitId)
  if (!target?.unit) return []
  return findUnitProducts(target.unit.unitId, ids.slice(0, PRODUCT_SEARCH_LIMIT))
}
