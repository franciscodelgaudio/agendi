import { isObjectIdOrHexString, Types } from "mongoose"
import { Inventory } from "@/models/Inventory"
import { Product } from "@/models/Product"

export async function loadInventoryScreen(workspaceId: string, inventoryId: string) {
  if (!isObjectIdOrHexString(inventoryId)) return null
  const workspace = new Types.ObjectId(workspaceId)
  const [inventory, others, products] = await Promise.all([
    Inventory.findOne({ _id: inventoryId, workspaceId: workspace }).select({ name: 1 }).lean(),
    Inventory.find({ workspaceId: workspace, _id: { $ne: new Types.ObjectId(inventoryId) } })
      .select({ name: 1 })
      .sort({ name: 1 })
      .lean(),
    Product.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1 }).lean(),
  ])
  if (!inventory) return null
  return {
    inventory: { id: inventory._id.toString(), name: inventory.name },
    inventories: others.map((other) => ({ id: other._id.toString(), name: other.name })),
    products: products.map((product) => ({ id: product._id.toString(), name: product.name })),
  }
}
