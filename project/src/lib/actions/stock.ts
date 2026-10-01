"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { can } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import {
  createStock,
  deleteStock,
  mergeStockItems,
  updateStock,
  type CreateStockError,
  type DeleteStockResult,
  type StockUnit,
  type UpdateStockError,
} from "@/lib/stock"
import { toLots } from "@/lib/stock-store"
import { Stock } from "@/models/Stock"
import { StockItem } from "@/models/StockItem"
import { Unit } from "@/models/Unit"

type DeleteStockError = Extract<DeleteStockResult, { ok: false }>["error"]

const errorMessages: Record<CreateStockError | UpdateStockError | DeleteStockError | "unauthenticated", string> = {
  invalid_input: "Informe o nome e as unidades do estoque.",
  invalid_name: "Informe o nome do estoque.",
  name_too_long: "O nome pode ter no máximo 40 caracteres.",
  no_units: "Escolha pelo menos uma unidade.",
  invalid_units: "Escolha só unidades deste workspace.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  stock_not_found: "Estoque não encontrado ou sem permissão.",
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
  return { name: formData.get("name"), units: formData.getAll("unitId") }
}

function unitsExist(workspaceId: string, unitIds: string[]) {
  return Unit.countDocuments({ _id: { $in: unitIds }, workspaceId }).then((count) => count === unitIds.length)
}

function toUnitDocs(units: StockUnit[]) {
  return units.map(({ unitId }) => ({ unitId: new Types.ObjectId(unitId) }))
}

// Junta no estoque de destino os itens dos estoques de origem: o mesmo produto vira um item só,
// com as quantidades somadas. Grava o destino antes de apagar as origens, para que uma falha no
// meio não perca quantidade.
async function mergeInto(targetId: Types.ObjectId, sourceIds: Types.ObjectId[]) {
  if (sourceIds.length === 0) return
  const items = await StockItem.find({ holderId: { $in: [targetId, ...sourceIds] } })
    .select({ productId: 1, lots: 1, depletedAt: 1 })
    .lean()
  const merged = mergeStockItems(
    items.map((item) => ({
      productId: item.productId.toString(),
      lots: toLots(item.lots),
      depletedAt: item.depletedAt as unknown as Date[],
    })),
  )
  await Promise.all(
    merged.map(({ productId, lots, depletedAt }) =>
      StockItem.updateOne(
        { holderId: targetId, productId: new Types.ObjectId(productId) },
        { $set: { quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0), lots, depletedAt } },
        { upsert: true },
      ),
    ),
  )
  await StockItem.deleteMany({ holderId: { $in: sourceIds } })
}

// As unidades entram no estoque levando o que têm no próprio. As que estavam em outro
// estoque compartilhado saem de lá sem levar nada, a não ser que ele fique sem unidades: aí
// tudo dele vem junto e ele é excluído.
async function bringUnitsIn(workspaceId: string, stockId: Types.ObjectId, units: StockUnit[]) {
  const unitIds = units.map((unit) => new Types.ObjectId(unit.unitId))
  const others = await Stock.find({ _id: { $ne: stockId }, workspaceId, "units.unitId": { $in: unitIds } })
    .select({ units: 1 })
    .lean()
  const emptied = others
    .filter((other) => other.units.every((unit) => unitIds.some((id) => id.equals(unit.unitId))))
    .map((other) => other._id)
  if (others.length > 0) {
    await Stock.updateMany(
      { _id: { $in: others.map((other) => other._id) } },
      { $pull: { units: { unitId: { $in: unitIds } } } },
    )
  }
  await mergeInto(stockId, [...unitIds, ...emptied])
  if (emptied.length > 0) await Stock.deleteMany({ _id: { $in: emptied } })
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
    insert: async ({ units, ...data }) => {
      const stock = await Stock.create({ ...data, units: toUnitDocs(units) })
      await bringUnitsIn(data.workspaceId, stock._id, units)
      return { id: stock._id.toString() }
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Unidade que sai do estoque volta para o próprio, vazio; a quantidade fica com quem continua.
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
    update: async (stockId, { units, ...data }) => {
      const _id = new Types.ObjectId(stockId)
      const { matchedCount } = await Stock.updateOne(
        { _id, workspaceId: target.workspaceId },
        { $set: { ...data, units: toUnitDocs(units) } },
      )
      if (matchedCount === 0) return false
      await bringUnitsIn(target.workspaceId!, _id, units)
      return true
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Desfaz o estoque compartilhado: tudo dele vai para a unidade escolhida (unitId no FormData);
// as outras voltam para o próprio estoque, vazio.
export async function deleteStockAction(
  workspaceId: string,
  stockId: string,
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(stockId) ? stockId : null
  const result = await deleteStock({ unitId: formData.get("unitId") }, target.workspaceId, id, {
    findUnitIds: async (workspaceId, stockId) => {
      const stock = await Stock.findOne({ _id: stockId, workspaceId }).select({ units: 1 }).lean()
      return stock && stock.units.map((unit) => unit.unitId.toString())
    },
    remove: async (stockId, unitId) => {
      const _id = new Types.ObjectId(stockId)
      if (!(await Stock.exists({ _id, workspaceId: target.workspaceId }))) return false
      await mergeInto(new Types.ObjectId(unitId), [_id])
      await Stock.deleteOne({ _id })
      return true
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
