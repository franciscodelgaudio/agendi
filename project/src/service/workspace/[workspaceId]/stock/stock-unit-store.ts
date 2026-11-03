import { cache } from "react"
import { cookies } from "next/headers"
import { isObjectIdOrHexString, Types } from "mongoose"
import { unitCookieName } from "@/service/workspace/[workspaceId]/unit-context"
import { Inventory } from "@/models/Inventory"
import { Unit } from "@/models/Unit"

export type StockUnit = {
  id: string
  name: string
  inventoryId: string | null
  inventories: { id: string; name: string }[]
}

export const loadStockUnit = cache(async (workspaceId: string): Promise<StockUnit | null> => {
  const unitId = (await cookies()).get(unitCookieName(workspaceId))?.value
  if (!unitId || !isObjectIdOrHexString(unitId)) return null
  const workspace = new Types.ObjectId(workspaceId)
  const [unit, inventories] = await Promise.all([
    Unit.findOne({ _id: unitId, workspaceId: workspace }).select({ name: 1, inventoryId: 1 }).lean(),
    Inventory.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1, _id: 1 }).lean(),
  ])
  if (!unit) return null
  return {
    id: unit._id.toString(),
    name: unit.name,
    inventoryId: unit.inventoryId?.toString() ?? null,
    inventories: inventories.map((inventory) => ({ id: inventory._id.toString(), name: inventory.name })),
  }
})
