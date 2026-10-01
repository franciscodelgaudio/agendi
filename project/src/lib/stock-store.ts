import { Types } from "mongoose"
import type { ProductScope } from "@/lib/product-scope"
import { Stock } from "@/models/Stock"
import { StockMovement } from "@/models/StockMovement"

// Estoque de várias unidades em que a unidade está.
export type UnitStock = { id: string; name: string; distributed: boolean; unitIds: string[] }

// null quando a unidade não está em nenhum estoque (tem os próprios produtos).
export async function findUnitStock(unitId: string): Promise<UnitStock | null> {
  const stock = await Stock.findOne({ "units.unitId": new Types.ObjectId(unitId) })
    .select({ name: 1, distributed: 1, units: 1 })
    .lean()
  return (
    stock && {
      id: stock._id.toString(),
      name: stock.name,
      distributed: stock.distributed,
      unitIds: stock.units.map((unit) => unit.unitId.toString()),
    }
  )
}

export function scopeOf(unitId: string, stock: UnitStock | null): ProductScope {
  return stock ? { stockId: stock.id } : { unitId }
}

// Produtos que a unidade enxerga, para quem só tem o unitId.
export async function findUnitScope(unitId: string) {
  const stock = await findUnitStock(unitId)
  return { stock, scope: scopeOf(unitId, stock) }
}

// Parte da unidade no estoque distribuído; sem a parte dela (entrou depois), zero.
export function unitQuantityOf(unitQuantities: { unitId: unknown; quantity: number }[], unitId: string) {
  return unitQuantities.find((unit) => String(unit.unitId) === unitId)?.quantity ?? 0
}

type Movement = {
  productId: string
  stockId: string | null
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

