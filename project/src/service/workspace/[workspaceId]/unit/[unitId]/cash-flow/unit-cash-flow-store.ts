import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { unitRefOptionsStages } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
import type { WalletSettlement } from "@/service/workspace/[workspaceId]/cash-flow/wallet"
import { Workspace } from "@/models/Workspace"

export type UnitCashFlowWallet = { id: string; name: string; settlement: WalletSettlement }
export type UnitCashFlow = {
  actor: Actor
  wallet: UnitCashFlowWallet | null
  wallets: { id: string; name: string }[]
}

export async function loadUnitCashFlow(workspaceId: string, unitId: string): Promise<UnitCashFlow> {
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { wallet: UnitCashFlowWallet | null } | null
    wallets: { id: string; name: string }[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $lookup: {
              from: "wallets",
              localField: "walletId",
              foreignField: "_id",
              as: "wallet",
              pipeline: [
                {
                  $project: {
                    _id: 0,
                    id: { $toString: "$_id" },
                    name: 1,
                    settlement: { $ifNull: ["$settlement", "immediate"] },
                  },
                },
              ],
            },
          },
          { $project: { _id: 0, wallet: { $ifNull: [{ $first: "$wallet" }, null] } } },
        ],
      },
    },
    ...unitRefOptionsStages(),
    { $project: { _id: 0, actor: 1, wallets: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  return { actor: workspace.actor, wallet: workspace.unit.wallet, wallets: workspace.wallets }
}
