import { Types } from "mongoose"
import { Inventory } from "@/models/Inventory"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"
import { WorkspaceMember } from "@/models/WorkspaceMember"

export async function loadUnitFormOptions(workspaceId: string) {
  const workspace = new Types.ObjectId(workspaceId)
  const [members, wallets, inventories] = await Promise.all([
    WorkspaceMember.aggregate<{ id: string; name: string }>([
      { $match: { workspaceId: workspace } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $project: { _id: 0, id: { $toString: "$_id" }, name: { $ifNull: ["$user.name", "$user.email"] } } },
      { $sort: { name: 1, id: 1 } },
    ]),
    Wallet.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1 }).lean(),
    Inventory.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1 }).lean(),
  ])
  return {
    members,
    wallets: wallets.map((wallet) => ({ id: wallet._id.toString(), name: wallet.name })),
    inventories: inventories.map((inventory) => ({ id: inventory._id.toString(), name: inventory.name })),
  }
}

export async function loadUnitRefs(workspaceId: string) {
  const units = await Unit.find({ workspaceId: new Types.ObjectId(workspaceId) }).select({ walletId: 1, inventoryId: 1 }).lean()
  return new Map(
    units.map((unit) => [
      unit._id.toString(),
      { walletId: unit.walletId?.toString() ?? "", inventoryId: unit.inventoryId?.toString() ?? "" },
    ]),
  )
}
