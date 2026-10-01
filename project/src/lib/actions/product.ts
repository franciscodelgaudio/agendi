"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { findManagedUnit } from "@/lib/unit-access"
import { forbiddenMessage, type UnitAccessError } from "@/lib/access-check"
import type { Permission } from "@/lib/permissions"
import { findManagedWorkspace } from "@/lib/workspace-access"
import {
  addStockItem,
  adjustStock,
  createCatalogProduct,
  createProduct,
  deleteProduct,
  depleteProduct,
  registerPurchase,
  updateCatalogProduct,
  type AddStockItemResult,
  type AdjustStockResult,
  type CreateCatalogProductResult,
  type CreateProductError,
  type RegisterPurchaseResult,
  type UpdateProductError,
} from "@/lib/product"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { findUnitProducts } from "@/lib/product-lookup"
import { PRODUCT_SEARCH_LIMIT, productSearchPipeline } from "@/lib/product-search"
import { recordStockPurchase } from "@/lib/stock-purchase"
import { addLots, consumeLots, type Lot } from "@/lib/stock-lots"
import { transferProduct, type TransferProductError } from "@/lib/stock-movement"
import { findUnitHolder, recordMovement, updateItemLots } from "@/lib/stock-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Product } from "@/models/Product"
import { StockItem } from "@/models/StockItem"
import { Unit } from "@/models/Unit"
import type { ProductOption } from "@/components/product-picker"

type AddStockItemError = Extract<AddStockItemResult, { ok: false }>["error"]
type CreateCatalogProductError = Extract<CreateCatalogProductResult, { ok: false }>["error"]
type RegisterPurchaseError = Extract<RegisterPurchaseResult, { ok: false }>["error"]
type AdjustStockError = Extract<AdjustStockResult, { ok: false }>["error"]

const errorMessages: Record<
  | CreateProductError
  | CreateCatalogProductError
  | UpdateProductError
  | TransferProductError
  | AddStockItemError
  | RegisterPurchaseError
  | AdjustStockError
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
  out_of_stock: "A quantidade deste produto já é zero. Registre uma compra antes de marcar que acabou.",
  above_current: "A contagem passa do que há em estoque. Para pôr mais unidades, registre uma compra.",
  invalid_units: "Escolha unidades deste workspace.",
  same_unit: "Escolha uma unidade de destino diferente da de origem.",
  same_stock: "As duas unidades usam o mesmo estoque compartilhado; não há o que transferir.",
  insufficient_stock: "O estoque de origem não tem essa quantidade do produto.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ProductActionState = { error: string | null }

function accessErrorMessage(error: UnitAccessError, permission: Permission) {
  return error === "forbidden" ? forbiddenMessage(permission) : errorMessages[error]
}

type ManagedTarget = {
  userId: string
  unit: { workspaceId: string; unitId: string } & Awaited<ReturnType<typeof findUnitHolder>>
}

// Unidade (se o usuário tiver a permissão nela), com o workspace e o estoque que ela usa;
// senão a mensagem de erro.
async function findManagedTarget(
  workspaceId: string,
  unitId: string,
  permission: Permission = "stock.manage",
): Promise<ManagedTarget | { error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findManagedUnit(workspaceId, unitId, userId, permission)
  if (!access.ok) return { error: accessErrorMessage(access.error, permission) }
  return { userId, unit: { ...access.unit, ...(await findUnitHolder(access.unit.unitId)) } }
}

// Compra vira despesa paga no grupo de insumos da unidade, criado se ela ainda não tiver.
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

// Lote comprado: despesa da unidade pelo preço pago e registro no histórico.
async function recordLotPurchase(
  userId: string,
  unit: { unitId: string; holderId: string },
  purchase: { productId: string; productName: string; quantity: number; unitCostCents: number },
) {
  await Promise.all([
    recordPurchase(userId, {
      unitId: unit.unitId,
      productId: purchase.productId,
      productName: purchase.productName,
      previousQuantity: 0,
      quantity: purchase.quantity,
      costCents: purchase.unitCostCents,
    }),
    recordMovement({
      productId: purchase.productId,
      holderId: unit.holderId,
      unitId: unit.unitId,
      kind: "purchase",
      quantity: purchase.quantity,
      costCents: purchase.quantity * purchase.unitCostCents,
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

// Primeiro lote do item: a quantidade com que ele entra no estoque, pelo preço de custo.
function firstLots(quantity: number, unitCostCents: number): Lot[] {
  return quantity > 0 ? [{ quantity, unitCostCents, purchasedAt: new Date() }] : []
}

// Cadastra o produto no catálogo do workspace e já o põe no estoque da unidade, com a
// quantidade comprada pelo preço de custo (o primeiro lote).
// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createProductAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await findManagedTarget(workspaceId, unitId)
  if ("error" in target) return { error: target.error }
  const { userId, unit } = target

  const result = await createProduct(productInput(formData), unit.unitId, async (input) => {
    const { quantity, name, costCents, notes, rating, avatarUrl } = input
    const product = await Product.create({ name, costCents, notes, rating, avatarUrl, workspaceId: unit.workspaceId })
    const id = product._id.toString()
    await StockItem.create({
      productId: product._id,
      holderId: unit.holderId,
      quantity,
      lots: firstLots(quantity, costCents),
    })
    if (quantity > 0) {
      await recordLotPurchase(userId, unit, { productId: id, productName: name, quantity, unitCostCents: costCents })
    }
    return { id }
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Põe no estoque da unidade um produto que já está no catálogo; a quantidade entra pelo preço
// da última compra.
export async function addStockItemAction(
  workspaceId: string,
  unitId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await findManagedTarget(workspaceId, unitId)
  if ("error" in target) return { error: target.error }
  const { userId, unit } = target

  const input = { productId: formData.get("productId"), quantity: formData.get("quantity") }
  const result = await addStockItem(input, async (productId, quantity) => {
    const product = await Product.findOne({ _id: productId, workspaceId: unit.workspaceId })
      .select({ name: 1, costCents: 1 })
      .lean()
    if (!product) return "not_found"
    try {
      await StockItem.create({
        productId: product._id,
        holderId: unit.holderId,
        quantity,
        lots: firstLots(quantity, product.costCents),
      })
    } catch (error) {
      if (isDuplicateKey(error)) return "already_in_stock"
      throw error
    }
    if (quantity > 0) {
      await recordLotPurchase(userId, unit, {
        productId,
        productName: product.name,
        quantity,
        unitCostCents: product.costCents,
      })
    }
    return "added"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// As escritas filtram pelo estoque da unidade (e pelo workspace, no catálogo).
async function resolveProductTarget(
  workspaceId: string,
  unitId: string,
  productId: string,
  permission: Permission = "stock.manage",
): Promise<(ManagedTarget & { productId: string | null }) | { error: string }> {
  const target = await findManagedTarget(workspaceId, unitId, permission)
  if ("error" in target) return target
  return { ...target, productId: isObjectIdOrHexString(productId) ? productId : null }
}

function stockItemOf(holderId: string, productId: string) {
  return { holderId: new Types.ObjectId(holderId), productId: new Types.ObjectId(productId) }
}

// Edita, a partir do estoque da unidade, os dados do produto no catálogo. A quantidade muda por
// compra ou ajuste.
export async function updateProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if ("error" in target) return { error: target.error }

  const result = await updateCatalogProduct(productInput(formData), target.productId, async (id, data) => {
    const unit = target.unit
    if (!(await StockItem.exists(stockItemOf(unit.holderId, id)))) return false
    const { matchedCount } = await Product.updateOne({ _id: id, workspaceId: unit.workspaceId }, { $set: data })
    return matchedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Compra de mais unidades: um lote novo com o preço pago, que vira o preço da última compra no
// catálogo, e a despesa no caixa da unidade.
export async function registerPurchaseAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if ("error" in target) return { error: target.error }
  const { userId } = target

  const input = { quantity: formData.get("quantity"), cost: formData.get("cost") }
  const result = await registerPurchase(input, target.productId, async (id, { quantity, unitCostCents }) => {
    const unit = target.unit
    const product = await Product.findOne({ _id: id, workspaceId: unit.workspaceId }).select({ name: 1 }).lean()
    if (!product) return "not_found"
    // A compra de agora é a mais recente, então o lote vai para o fim.
    const { matchedCount } = await StockItem.updateOne(stockItemOf(unit.holderId, id), {
      $push: { lots: { quantity, unitCostCents, purchasedAt: new Date() } },
      $inc: { quantity },
    })
    if (matchedCount === 0) return "not_found"
    await Product.updateOne({ _id: id }, { $set: { costCents: unitCostCents } })
    await recordLotPurchase(userId, unit, { productId: id, productName: product.name, quantity, unitCostCents })
    return "purchased"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Ajuste pela contagem: o que falta sai dos lotes mais antigos, sem despesa.
export async function adjustStockAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if ("error" in target) return { error: target.error }
  const { userId } = target

  const result = await adjustStock({ quantity: formData.get("quantity") }, target.productId, async (id, counted) => {
    const unit = target.unit
    type Adjusted = { kind: "above_current" } | { kind: "adjusted"; quantity: number; costCents: number }
    const outcome = await updateItemLots<Adjusted>(stockItemOf(unit.holderId, id), (lots) => {
      const current = lots.reduce((sum, lot) => sum + lot.quantity, 0)
      const consumed = consumeLots(lots, current - counted)
      if (counted > current || !consumed.ok) return { stop: { kind: "above_current" } }
      return { lots: consumed.lots, result: { kind: "adjusted", quantity: current - counted, costCents: consumed.costCents } }
    })
    if (!outcome) return "not_found"
    if (outcome.kind === "above_current") return "above_current"
    await recordMovement({
      productId: id,
      holderId: unit.holderId,
      unitId: unit.unitId,
      kind: "adjustment",
      quantity: outcome.quantity,
      costCents: outcome.costCents,
      createdBy: userId,
    })
    return "adjusted"
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
  if ("error" in target) return { error: target.error }

  const result = await deleteProduct(target.productId, async (id) => {
    const { deletedCount } = await StockItem.deleteOne(stockItemOf(target.unit.holderId, id))
    return deletedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Uma unidade do produto acabou no estoque da unidade: sai do lote mais antigo e a data fica
// registrada, na mesma escrita.
export async function depleteProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId)
  if ("error" in target) return { error: target.error }
  const { userId } = target

  const result = await depleteProduct(target.productId, async (id) => {
    const unit = target.unit
    const outcome = await updateItemLots<number | null>(
      stockItemOf(unit.holderId, id),
      (lots) => {
        const consumed = consumeLots(lots, 1)
        return consumed.ok ? { lots: consumed.lots, result: consumed.costCents } : { stop: null }
      },
      { $push: { depletedAt: new Date() } },
    )
    if (outcome === null) return (await StockItem.exists(stockItemOf(unit.holderId, id))) ? "out_of_stock" : "not_found"
    await recordMovement({
      productId: id,
      holderId: unit.holderId,
      unitId: unit.unitId,
      kind: "depletion",
      quantity: 1,
      costCents: outcome,
      createdBy: userId,
    })
    return "depleted"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Leva produto do estoque de uma unidade para o de outra do workspace, com os lotes (preço e
// data de compra) que saem pelo PEPS. unitId é a unidade de onde a tela foi aberta, onde o
// usuário precisa da permissão de transferir.
export async function transferProductAction(
  workspaceId: string,
  unitId: string,
  productId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveProductTarget(workspaceId, unitId, productId, "stock.transfer")
  if ("error" in target) return { error: target.error }
  const { userId } = target

  const input = { fromUnitId: formData.get("fromUnitId"), toUnitId: formData.get("toUnitId"), quantity: formData.get("quantity") }
  const result = await transferProduct(input, target.productId, async (id, { fromUnitId, toUnitId, quantity }) => {
    const { workspaceId: ownedWorkspaceId } = target.unit
    const units = await Unit.countDocuments({ _id: { $in: [fromUnitId, toUnitId] }, workspaceId: ownedWorkspaceId })
    if (units < 2) return "invalid_units"
    const [from, to] = await Promise.all([findUnitHolder(fromUnitId), findUnitHolder(toUnitId)])
    if (from.holderId === to.holderId) return "same_stock"

    const taken = await updateItemLots<{ consumed: Lot[]; costCents: number } | null>(stockItemOf(from.holderId, id), (lots) => {
      const consumed = consumeLots(lots, quantity)
      return consumed.ok ? { lots: consumed.lots, result: consumed } : { stop: null }
    })
    if (taken === null) {
      return (await StockItem.exists(stockItemOf(from.holderId, id))) ? "insufficient_stock" : "not_found"
    }
    // O destino ganha o item se ainda não tiver o produto.
    const destination = stockItemOf(to.holderId, id)
    await StockItem.updateOne(destination, { $setOnInsert: { quantity: 0, lots: [], depletedAt: [] } }, { upsert: true })
    await updateItemLots(destination, (lots) => ({ lots: addLots(lots, taken.consumed), result: true }))
    await recordMovement({
      productId: id,
      holderId: from.holderId,
      unitId: fromUnitId,
      kind: "transfer",
      quantity,
      toUnitId,
      costCents: taken.costCents,
      createdBy: userId,
    })
    return "transferred"
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Id do workspace se o usuário gerenciar o estoque nele; senão a mensagem de erro.
async function resolveCatalogWorkspace(workspaceId: string): Promise<{ workspaceId: string } | { error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const managed = await findManagedWorkspace(workspaceId, userId, "stock.manage")
  if (!managed.ok) return { error: accessErrorMessage(managed.error, "stock.manage") }
  return { workspaceId: managed.access.id }
}

// Cadastro no catálogo (tela de produtos do workspace), sem pôr em nenhum estoque.
export async function createCatalogProductAction(
  workspaceId: string,
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const target = await resolveCatalogWorkspace(workspaceId)
  if ("error" in target) return { error: target.error }

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
  if ("error" in target) return { error: target.error }

  const id = isObjectIdOrHexString(productId) ? productId : null
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
  if ("error" in target) return { error: target.error }

  const id = isObjectIdOrHexString(productId) ? productId : null
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
  if ("error" in target) return []
  return Product.aggregate<ProductOption>(productSearchPipeline(target.unit.workspaceId, q))
}

// Nomes dos produtos já escolhidos (edição ou padrão do serviço); os excluídos não voltam.
export async function productNamesAction(workspaceId: string, unitId: string, ids: string[]): Promise<ProductOption[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return []
  const target = await findManagedTarget(workspaceId, unitId)
  if ("error" in target) return []
  return findUnitProducts(target.unit.unitId, ids.slice(0, PRODUCT_SEARCH_LIMIT))
}
