import { Types } from "mongoose"
import { Stock } from "@/models/Stock"
import { StockMovement } from "@/models/StockMovement"

// Estoque compartilhado em que a unidade está.
export type UnitStock = { id: string; name: string; unitIds: string[] }

// Estoque que a unidade usa: holderId é o do compartilhado ou o dela mesma; unitIds, as
// unidades que usam esse estoque.
export type UnitHolder = { stock: UnitStock | null; holderId: string; unitIds: string[] }

// null quando a unidade não está em nenhum estoque compartilhado.
export async function findUnitStock(unitId: string): Promise<UnitStock | null> {
  const stock = await Stock.findOne({ "units.unitId": new Types.ObjectId(unitId) })
    .select({ name: 1, units: 1 })
    .lean()
  return (
    stock && {
      id: stock._id.toString(),
      name: stock.name,
      unitIds: stock.units.map((unit) => unit.unitId.toString()),
    }
  )
}

export function holderOf(unitId: string, stock: UnitStock | null): UnitHolder {
  return stock ? { stock, holderId: stock.id, unitIds: stock.unitIds } : { stock, holderId: unitId, unitIds: [unitId] }
}

export async function findUnitHolder(unitId: string) {
  return holderOf(unitId, await findUnitStock(unitId))
}

// Estoque de cada unidade do workspace (unitId -> holderId).
export async function findHolderByUnit(workspaceId: string, unitIds: string[]) {
  const stocks = await Stock.find({ workspaceId }).select({ units: 1 }).lean()
  const byUnit = new Map(unitIds.map((unitId) => [unitId, unitId]))
  for (const stock of stocks) {
    for (const unit of stock.units) byUnit.set(unit.unitId.toString(), stock._id.toString())
  }
  return byUnit
}

type Movement = {
  productId: string
  holderId: string
  unitId: string
  kind: "purchase" | "adjustment" | "depletion" | "transfer"
  quantity: number
  toUnitId?: string
  createdBy: string
}

// Quantidade zero não é movimentação.
export async function recordMovement({ quantity, ...movement }: Movement) {
  if (quantity <= 0) return
  await StockMovement.create({ ...movement, quantity, toUnitId: movement.toUnitId ?? null })
}
