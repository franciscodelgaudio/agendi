"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { can } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import {
  createStock,
  deleteStock,
  leavesProductsBehind,
  updateStock,
  type CreateStockError,
  type StockUnit,
  type UpdateStockError,
} from "@/lib/stock"
import { distributeStock, type DistributeStockError } from "@/lib/stock-movement"
import { Product } from "@/models/Product"
import { Stock } from "@/models/Stock"
import { Unit } from "@/models/Unit"

const errorMessages: Record<
  CreateStockError | UpdateStockError | DistributeStockError | "stock_not_empty" | "already_distributed" | "unauthenticated",
  string
> = {
  invalid_input: "Informe o nome e as unidades do estoque.",
  invalid_name: "Informe o nome do estoque.",
  name_too_long: "O nome pode ter no máximo 40 caracteres.",
  no_units: "Escolha pelo menos uma unidade.",
  invalid_units: "Escolha só unidades deste estoque e deste workspace.",
  unit_stock_not_empty:
    "Uma das unidades deixaria produtos para trás no estoque em que está hoje. Exclua ou transfira esses produtos antes.",
  removed_unit_has_stock: "Uma das unidades que sai ainda tem produtos neste estoque. Transfira para outra unidade antes.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  stock_not_found: "Estoque não encontrado ou sem permissão.",
  stock_not_empty: "O estoque ainda tem produtos. Exclua-os antes de excluir o estoque.",
  invalid_quantity: "Informe as quantidades como números inteiros, entre 0 e 1.000.000.",
  distribution_exceeds_quantity: "A soma das unidades passa da quantidade de um dos produtos.",
  already_distributed: "Este estoque já está dividido entre as unidades.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type StockActionState = { error: string | null }

// Id do workspace se o usuário gerenciar o estoque nele; undefined sem permissão, null = sessão expirada.
async function resolveWorkspace(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access && can(access.actor, "stock.manage") ? access.id : undefined }
}

function stockInput(formData: FormData) {
  return { name: formData.get("name"), distributed: formData.get("distributed"), units: formData.getAll("unitId") }
}

function unitsExist(workspaceId: string, unitIds: string[]) {
  return Unit.countDocuments({ _id: { $in: unitIds }, workspaceId }).then((count) => count === unitIds.length)
}

// Parte de cada unidade somada em todos os produtos do estoque distribuído.
async function quantitiesByUnit(stockId: Types.ObjectId, unitIds: Types.ObjectId[]) {
  const rows = await Product.aggregate<{ _id: Types.ObjectId; quantity: number }>([
    { $match: { stockId } },
    { $unwind: "$unitQuantities" },
    { $match: { "unitQuantities.unitId": { $in: unitIds } } },
    { $group: { _id: "$unitQuantities.unitId", quantity: { $sum: "$unitQuantities.quantity" } } },
  ])
  return new Map(rows.map((row) => [row._id.toString(), row.quantity]))
}

// Para cada unidade que muda de estoque, olha o de onde ela sai: o de várias unidades em que
// está (fora excludeId, que é o próprio) ou, fora de qualquer um, os produtos só dela.
async function unitsLeavingWithStock(unitIds: string[], excludeId: string | null) {
  for (const unitId of unitIds) {
    const id = new Types.ObjectId(unitId)
    const origin = await Stock.findOne({ "units.unitId": id }).select({ distributed: 1, units: 1 }).lean()
    if (origin && origin._id.toString() === excludeId) continue
    const leaves = origin
      ? leavesProductsBehind({
          unitCount: origin.units.length,
          productCount: await Product.countDocuments({ stockId: origin._id }),
          distributed: origin.distributed,
          unitQuantity: origin.distributed ? ((await quantitiesByUnit(origin._id, [id])).get(unitId) ?? 0) : 0,
        })
      : leavesProductsBehind({
          unitCount: 1,
          productCount: await Product.countDocuments({ unitId: id, stockId: null }),
          distributed: false,
          unitQuantity: 0,
        })
    if (leaves) return true
  }
  return false
}

function toUnitDocs(units: StockUnit[]) {
  return units.map(({ unitId }) => ({ unitId: new Types.ObjectId(unitId) }))
}

// Tira as unidades do estoque em que estavam e a parte delas dos produtos de lá (zero, já
// conferido); o estoque que fica sem unidades também fica sem produtos e é excluído.
async function moveUnitsFromOtherStocks(workspaceId: string, stockId: Types.ObjectId, units: StockUnit[]) {
  const unitIds = units.map((unit) => new Types.ObjectId(unit.unitId))
  const others = await Stock.find({ _id: { $ne: stockId }, workspaceId, "units.unitId": { $in: unitIds } })
    .select({ _id: 1 })
    .lean()
  if (others.length === 0) return
  const otherIds = others.map((other) => other._id)
  await Promise.all([
    Stock.updateMany({ _id: { $in: otherIds } }, { $pull: { units: { unitId: { $in: unitIds } } } }),
    Product.updateMany({ stockId: { $in: otherIds } }, { $pull: { unitQuantities: { unitId: { $in: unitIds } } } }),
  ])
  await Stock.deleteMany({ _id: { $in: otherIds }, units: { $size: 0 } })
}

export async function createStockAction(
  workspaceId: string,
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await createStock(stockInput(formData), target.workspaceId, {
    unitsExist,
    unitsLeavingWithStock,
    insert: async ({ units, ...data }) => {
      const stock = await Stock.create({ ...data, units: toUnitDocs(units) })
      await moveUnitsFromOtherStocks(data.workspaceId, stock._id, units)
      return { id: stock._id.toString() }
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// A escrita filtra por workspaceId para que um estoque de outro workspace não seja encontrado.
export async function updateStockAction(
  workspaceId: string,
  stockId: string,
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(stockId) ? stockId : null
  const result = await updateStock(stockInput(formData), target.workspaceId, id, {
    unitsExist,
    unitsLeavingWithStock,
    findUnitIds: async (workspaceId, stockId) => {
      const stock = await Stock.findOne({ _id: stockId, workspaceId }).select({ units: 1 }).lean()
      return stock && stock.units.map((unit) => unit.unitId.toString())
    },
    unitsHoldQuantity: async (stockId, unitIds) => {
      const quantities = await quantitiesByUnit(
        new Types.ObjectId(stockId),
        unitIds.map((unitId) => new Types.ObjectId(unitId)),
      )
      return [...quantities.values()].some((quantity) => quantity > 0)
    },
    update: async (stockId, { units, ...data }) => {
      const _id = new Types.ObjectId(stockId)
      const { matchedCount } = await Stock.updateOne(
        { _id, workspaceId: target.workspaceId },
        { $set: { ...data, units: toUnitDocs(units) } },
      )
      if (matchedCount === 0) return false
      const kept = units.map((unit) => new Types.ObjectId(unit.unitId))
      await Promise.all([
        moveUnitsFromOtherStocks(target.workspaceId!, _id, units),
        // Quem saiu já estava com zero; a parte dele sai dos produtos.
        Product.updateMany({ stockId: _id }, { $pull: { unitQuantities: { unitId: { $nin: kept } } } }),
      ])
      return true
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteStockAction(workspaceId: string, stockId: string): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(stockId) ? stockId : null
  const result = await deleteStock(id, {
    hasProducts: async (stockId) => !!(await Product.exists({ stockId })),
    remove: async (stockId) => {
      const { deletedCount } = await Stock.deleteOne({ _id: stockId, workspaceId: target.workspaceId })
      return deletedCount > 0
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Divide o estoque compartilhado entre as unidades: os campos quantity-<produto>-<unidade>
// dizem quanto de cada produto está em cada unidade e defaultUnitId fica com o resto.
export async function distributeStockAction(
  workspaceId: string,
  stockId: string,
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }
  if (!target.workspaceId || !isObjectIdOrHexString(stockId)) return { error: errorMessages.stock_not_found }

  const stock = await Stock.findOne({ _id: stockId, workspaceId: target.workspaceId }).lean()
  if (!stock) return { error: errorMessages.stock_not_found }
  if (stock.distributed) return { error: errorMessages.already_distributed }
  const products = await Product.find({ stockId: stock._id }).select({ quantity: 1 }).lean()
  const unitIds = stock.units.map((unit) => unit.unitId.toString())

  const result = distributeStock(
    {
      defaultUnitId: formData.get("defaultUnitId"),
      products: products.map((product) => ({
        productId: product._id.toString(),
        units: unitIds.map((unitId) => ({
          unitId,
          quantity: formData.get(`quantity-${product._id}-${unitId}`) ?? "",
        })),
      })),
    },
    { unitIds, products: products.map((product) => ({ productId: product._id.toString(), quantity: product.quantity })) },
  )
  if (!result.ok) return { error: errorMessages[result.error] }

  // Só grava a divisão do produto cuja quantidade não mudou desde a leitura.
  await Promise.all(
    result.products.map(({ productId, unitQuantities }) =>
      Product.updateOne(
        {
          _id: new Types.ObjectId(productId),
          stockId: stock._id,
          quantity: products.find((product) => product._id.toString() === productId)!.quantity,
        },
        { $set: { unitQuantities } },
      ),
    ),
  )
  await Stock.updateOne({ _id: stock._id }, { $set: { distributed: true } })
  // O que mudou no meio (ou foi cadastrado agora) fica todo com a unidade padrão.
  const defaultUnitId = new Types.ObjectId(String(formData.get("defaultUnitId")))
  await Product.updateMany({ stockId: stock._id, unitQuantities: { $size: 0 } }, [
    {
      $set: {
        unitQuantities: stock.units.map((unit) => ({
          unitId: unit.unitId,
          quantity: unit.unitId.equals(defaultUnitId) ? "$quantity" : 0,
        })),
      },
    },
  ])

  refresh()
  return { error: null }
}

// Volta o estoque a uma quantidade só por produto, somando as partes das unidades (que já são o total).
export async function shareStockAction(workspaceId: string, stockId: string): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }
  if (!target.workspaceId || !isObjectIdOrHexString(stockId)) return { error: errorMessages.stock_not_found }

  const { matchedCount } = await Stock.updateOne(
    { _id: stockId, workspaceId: target.workspaceId },
    { $set: { distributed: false } },
  )
  if (matchedCount === 0) return { error: errorMessages.stock_not_found }
  await Product.updateMany({ stockId }, { $set: { unitQuantities: [] } })

  refresh()
  return { error: null }
}
