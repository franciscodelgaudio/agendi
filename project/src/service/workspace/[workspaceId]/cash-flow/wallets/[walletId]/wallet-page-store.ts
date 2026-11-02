import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import { Wallet } from "@/models/Wallet"

export async function loadWalletCashFlow(workspaceId: string, walletId: string) {
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  if (!isObjectIdOrHexString(walletId)) notFound()

  const [wallet] = await Wallet.aggregate<WalletListItem>([
    { $match: { _id: new Types.ObjectId(walletId) } },
    ...walletListPipeline(workspaceId),
  ])
  if (!wallet) notFound()
  return { actor, wallet: { ...wallet, settlement: wallet.settlement ?? "immediate" } }
}
