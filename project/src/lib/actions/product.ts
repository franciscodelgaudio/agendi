"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { findManagedUnit } from "@/lib/unit-access"
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
import { PRODUCT_SEARCH_LIMIT, productSearchPipeline } from "@/lib/product-search"
import { recordStockPurchase } from "@/lib/stock-purchase"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Product } from "@/models/Product"
import type { ProductOption } from "@/components/product-picker"

const errorMessages: Record<CreateProductError | UpdateProductError | "out_of_stock" | "unauthenticated", string> = {
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
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ProductActionState = { error: string | null }

// id da unidade se o usuário puder gerenciá-la; senão undefined. null = sessão expirada.
async function findManagedUnitId(workspaceId: string, unitId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  return (await findManagedUnit(workspaceId, unitId, userId, "stock.manage"))?.unitId
}

// Aumento de estoque vira despesa paga no grupo de insumos, criado se a unidade ainda não tiver.
async function recordPurchase(change: Parameters<typeof recordStockPurchase>[0]) {
  const userId = await getSessionUserId()
  if (!userId) return
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
export async function createProductAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const ownedUnitId = await findManagedUnitId(workspaceId, unitId)
  if (ownedUnitId === null) return { error: errorMessages.unauthenticated }

  const result = await createProduct(productInput(formData), ownedUnitId, async (data) => {
    const product = await Product.create(data)
    const id = product._id.toString()
    await recordPurchase({ ...data, productId: id, productName: data.name, previousQuantity: 0 })
    return { id }
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Só repassa o productId quando a unidade é gerenciável; a escrita ainda filtra
// por unitId para que um produto de outra unidade não seja encontrado.
// null = sessão expirada.
async function resolveProductTarget(workspaceId: string, unitId: string, productId: string) {
  const ownedUnitId = await findManagedUnitId(workspaceId, unitId)
  if (ownedUnitId === null) return null
  return { ownedUnitId, productId: ownedUnitId && isObjectIdOrHexString(productId) ? productId : null }
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

  const result = await updateProduct(productInput(formData), target.productId, async (id, data) => {
    // Devolve o documento de antes para saber quanto entrou no estoque.
    const previous = await Product.findOneAndUpdate(
      { _id: id, unitId: target.ownedUnitId },
      { $set: data },
      { returnDocument: "before" },
    )
      .select({ quantity: 1 })
      .lean()
    if (!previous) return false
    await recordPurchase({
      ...data,
      unitId: target.ownedUnitId!,
      productId: id,
      productName: data.name,
      previousQuantity: previous.quantity,
    })
    return true
  })

  if (!result.ok) return { error: errorMessages[result.error] }

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
    const { deletedCount } = await Product.deleteOne({ _id: id, unitId: target.ownedUnitId })
    return deletedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Uma unidade do produto acabou: registra a data e tira 1 da quantidade, numa só escrita.
export async function depleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await depleteProduct(target.productId, async (id) => {
    const { matchedCount } = await Product.updateOne(
      { _id: id, unitId: target.ownedUnitId, quantity: { $gt: 0 } },
      { $inc: { quantity: -1 }, $push: { depletedAt: new Date() } },
    )
    if (matchedCount > 0) return "depleted"
    const exists = await Product.exists({ _id: id, unitId: target.ownedUnitId })
    return exists ? "out_of_stock" : "not_found"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Busca do seletor de produtos: no máximo PRODUCT_SEARCH_LIMIT da unidade, só id e nome.
export async function searchProductsAction(workspaceId: string, unitId: string, q: string): Promise<ProductOption[]> {
  if (typeof q !== "string") return []
  const ownedUnitId = await findManagedUnitId(workspaceId, unitId)
  if (!ownedUnitId) return []
  return Product.aggregate<ProductOption>(productSearchPipeline(ownedUnitId, q))
}

// Nomes dos produtos já escolhidos (edição ou padrão do serviço); os excluídos não voltam.
export async function productNamesAction(workspaceId: string, unitId: string, ids: string[]): Promise<ProductOption[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return []
  const ownedUnitId = await findManagedUnitId(workspaceId, unitId)
  if (!ownedUnitId) return []
  return findUnitProducts(ownedUnitId, ids.slice(0, PRODUCT_SEARCH_LIMIT))
}
