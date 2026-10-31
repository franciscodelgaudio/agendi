import mongoose, { isObjectIdOrHexString, Types, type ClientSession } from "mongoose"
import { connectDB } from "@/service/_shared/database/mongoose"
import type { MovementData, TransferData } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/stock-movement"
import { Inventory } from "@/models/Inventory"
import { Product } from "@/models/Product"
import { StockMovement } from "@/models/StockMovement"

export class InsufficientStockError extends Error {}

export async function productExists(workspaceId: string, productId: string) {
  if (!isObjectIdOrHexString(productId)) return false
  return !!(await Product.exists({ _id: productId, workspaceId }))
}

export async function inventoryExists(workspaceId: string, inventoryId: string) {
  if (!isObjectIdOrHexString(inventoryId)) return false
  return !!(await Inventory.exists({ _id: inventoryId, workspaceId }))
}

export async function currentQuantity(workspaceId: string, inventoryId: string, productId: string) {
  if (!isObjectIdOrHexString(inventoryId) || !isObjectIdOrHexString(productId)) return null
  const inventory = await Inventory.findOne({ _id: inventoryId, workspaceId }).select({ products: 1 }).lean()
  if (!inventory) return null
  return inventory.products.find((item) => item.productId.equals(productId))?.quantity ?? 0
}

async function changeQuantity(inventoryId: Types.ObjectId, productId: Types.ObjectId, delta: number, session: ClientSession) {
  if (delta < 0) {
    const { matchedCount } = await Inventory.updateOne(
      { _id: inventoryId, products: { $elemMatch: { productId, quantity: { $gte: -delta } } } },
      { $inc: { "products.$.quantity": delta } },
      { session },
    )
    if (matchedCount === 0) throw new InsufficientStockError()
    return
  }
  const { matchedCount } = await Inventory.updateOne(
    { _id: inventoryId, "products.productId": productId },
    { $inc: { "products.$.quantity": delta } },
    { session },
  )
  if (matchedCount === 0) {
    await Inventory.updateOne({ _id: inventoryId }, { $push: { products: { productId, quantity: delta } } }, { session })
  }
}

async function inTransaction(work: (session: ClientSession) => Promise<void>) {
  await connectDB()
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(() => work(session))
  } finally {
    await session.endSession()
  }
}

export async function applyMovement({ workspaceId, inventoryId, productId, name, type, quantity }: MovementData) {
  const inventory = new Types.ObjectId(inventoryId)
  const product = new Types.ObjectId(productId)
  await inTransaction(async (session) => {
    await changeQuantity(inventory, product, type === "in" ? quantity : -quantity, session)
    await StockMovement.create(
      [{ name, type, quantity, productId: product, inventoryId: inventory, workspaceId: new Types.ObjectId(workspaceId) }],
      { session },
    )
  })
}

export async function applyTransfer({ workspaceId, fromInventoryId, toInventoryId, productId, quantity }: TransferData) {
  const from = new Types.ObjectId(fromInventoryId)
  const to = new Types.ObjectId(toInventoryId)
  const product = new Types.ObjectId(productId)
  const workspace = new Types.ObjectId(workspaceId)
  const names = await Inventory.find({ _id: { $in: [from, to] } }).select({ name: 1 }).lean()
  const nameOf = (id: Types.ObjectId) => names.find((inventory) => inventory._id.equals(id))?.name ?? ""
  await inTransaction(async (session) => {
    await changeQuantity(from, product, -quantity, session)
    await changeQuantity(to, product, quantity, session)
    await StockMovement.create(
      [
        { name: `Transferência para ${nameOf(to)}`, type: "out", quantity, productId: product, inventoryId: from, workspaceId: workspace },
        { name: `Transferência de ${nameOf(from)}`, type: "in", quantity, productId: product, inventoryId: to, workspaceId: workspace },
      ],
      { session, ordered: true },
    )
  })
}
