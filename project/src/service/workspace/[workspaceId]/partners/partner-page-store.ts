import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import type { PartnerTier, ThresholdRule } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"
import { Workspace } from "@/models/Workspace"

export type PartnerPageUnit = { id: string; name: string; walletId: string | null }
export type PartnerPagePartner = {
  id: string
  name: string
  imageUrl: string | null
  thresholdRule: ThresholdRule
  tiers: PartnerTier[]
  unit: PartnerPageUnit | null
}
export type PartnerPage = { actor: Actor; partner: PartnerPagePartner; freeUnits: { id: string; name: string }[] }

export async function loadPartnerPage(workspaceId: string, partnerId: string): Promise<PartnerPage> {
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(partnerId)) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    partner: PartnerPagePartner | null
    units: { id: string; name: string; hasPartner: boolean }[]
  }>([
    ...access,
    {
      $lookup: {
        from: "partners",
        localField: "_id",
        foreignField: "workspaceId",
        as: "partner",
        pipeline: [
          { $match: { _id: new Types.ObjectId(partnerId) } },
          {
            $lookup: {
              from: "units",
              localField: "unitId",
              foreignField: "_id",
              as: "unit",
              pipeline: [
                {
                  $project: {
                    _id: 0,
                    id: { $toString: "$_id" },
                    name: 1,
                    walletId: { $cond: [{ $eq: [{ $ifNull: ["$walletId", null] }, null] }, null, { $toString: "$walletId" }] },
                  },
                },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              imageUrl: { $ifNull: ["$imageUrl", null] },
              thresholdRule: 1,
              tiers: { $map: { input: "$tiers", in: { thresholdCents: "$$this.thresholdCents", shareBps: "$$this.shareBps" } } },
              unit: { $ifNull: [{ $first: "$unit" }, null] },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          { $lookup: { from: "partners", localField: "_id", foreignField: "unitId", as: "partner", pipeline: [{ $limit: 1 }] } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, hasPartner: { $gt: [{ $size: "$partner" }, 0] } } },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, units: 1, partner: { $ifNull: [{ $first: "$partner" }, null] } } },
  ])
  if (!workspace?.partner) notFound()
  return {
    actor: workspace.actor,
    partner: workspace.partner,
    freeUnits: workspace.units.filter((unit) => !unit.hasPartner).map(({ id, name }) => ({ id, name })),
  }
}
