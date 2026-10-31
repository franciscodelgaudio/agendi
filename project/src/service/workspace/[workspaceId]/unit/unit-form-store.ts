import { Types } from "mongoose"
import { Inventory } from "@/models/Inventory"
import { Wallet } from "@/models/Wallet"
import { WorkspaceMember } from "@/models/WorkspaceMember"

export async function loadUnitFormOptions(workspaceId: string) {
  const members = await WorkspaceMember.aggregate<{ id: string; name: string }>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId) } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $project: { _id: 0, id: { $toString: "$_id" }, name: { $ifNull: ["$user.name", "$user.email"] } } },
    { $sort: { name: 1, id: 1 } },
  ])
  return { members }
}

export async function loadUnitRefOptions(workspaceId: string) {
  const workspace = new Types.ObjectId(workspaceId)
  const [wallets, inventories] = await Promise.all([
    Wallet.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1 }).lean(),
    Inventory.find({ workspaceId: workspace }).select({ name: 1 }).sort({ name: 1 }).lean(),
  ])
  return {
    wallets: wallets.map((wallet) => ({ id: wallet._id.toString(), name: wallet.name })),
    inventories: inventories.map((inventory) => ({ id: inventory._id.toString(), name: inventory.name })),
  }
}
