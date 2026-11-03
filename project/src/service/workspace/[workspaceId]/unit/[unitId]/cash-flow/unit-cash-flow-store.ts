import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { unitRefOptionsStages } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
import type { PartnerTier, ThresholdRule } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"
import { Workspace } from "@/models/Workspace"

export type UnitCashFlowWallet = { id: string; name: string }
export type UnitPartner = { id: string; name: string; thresholdRule: ThresholdRule; tiers: PartnerTier[] }
export type UnitCashFlow = {
  actor: Actor
  wallet: UnitCashFlowWallet | null
  partner: UnitPartner | null
  unlinkedPartners: UnitPartner[]
  wallets: { id: string; name: string }[]
}

const PARTNER_PROJECT = {
  $project: { _id: 0, id: { $toString: "$_id" }, name: 1, thresholdRule: 1, tiers: { thresholdCents: 1, shareBps: 1 } },
}

export async function loadUnitCashFlow(workspaceId: string, unitId: string): Promise<UnitCashFlow> {
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { wallet: UnitCashFlowWallet | null; partner: UnitPartner | null } | null
    wallets: { id: string; name: string }[]
    unlinkedPartners: UnitPartner[]
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
              pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
            },
          },
          {
            $lookup: {
              from: "partners",
              localField: "_id",
              foreignField: "unitId",
              as: "partner",
              pipeline: [PARTNER_PROJECT],
            },
          },
          {
            $project: {
              _id: 0,
              wallet: { $ifNull: [{ $first: "$wallet" }, null] },
              partner: { $ifNull: [{ $first: "$partner" }, null] },
            },
          },
        ],
      },
    },
    ...unitRefOptionsStages(),
    {
      $lookup: {
        from: "partners",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unlinkedPartners",
        pipeline: [{ $match: { unitId: null } }, { $sort: { name: 1, _id: 1 } }, PARTNER_PROJECT],
      },
    },
    { $project: { _id: 0, actor: 1, wallets: 1, unlinkedPartners: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  return {
    actor: workspace.actor,
    wallet: workspace.unit.wallet,
    partner: workspace.unit.partner,
    unlinkedPartners: workspace.unlinkedPartners,
    wallets: workspace.wallets,
  }
}
