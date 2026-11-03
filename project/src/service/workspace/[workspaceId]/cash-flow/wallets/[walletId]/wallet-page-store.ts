import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import type { UnitPartner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { Partner } from "@/models/Partner"
import { Wallet } from "@/models/Wallet"

export type WalletPartner = UnitPartner & { unitId: string }

export async function loadWalletCashFlow(workspaceId: string, walletId: string) {
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  if (!isObjectIdOrHexString(walletId)) notFound()

  const [wallet] = await Wallet.aggregate<WalletListItem>([
    { $match: { _id: new Types.ObjectId(walletId) } },
    ...walletListPipeline(workspaceId),
  ])
  if (!wallet) notFound()
  const partners = await Partner.aggregate<WalletPartner>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId), unitId: { $in: wallet.units.map((unit) => new Types.ObjectId(unit.id)) } } },
    { $sort: { name: 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        thresholdRule: 1,
        tiers: { thresholdCents: 1, shareBps: 1 },
        unitId: { $toString: "$unitId" },
      },
    },
  ])
  return { actor, wallet, partners }
}
