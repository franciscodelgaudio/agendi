import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone"
import type { OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance"
import type { WalletSettlement } from "@/service/workspace/[workspaceId]/cash-flow/wallet"
import { Transaction } from "@/models/Transaction"
import { Wallet } from "@/models/Wallet"

function dayStart(day: string) {
  const [year, month, date] = parseDay(day)!
  return new Date(Date.UTC(year, month - 1, date, BRT_OFFSET_HOURS))
}

export async function insertWallet({
  workspaceId,
  name,
  settlement,
  openingBalance,
}: {
  workspaceId: string
  name: string
  settlement: WalletSettlement
  openingBalance: OpeningBalance | null
}) {
  const wallet = await Wallet.create({ name, settlement, workspaceId })
  if (openingBalance && openingBalance.amountCents > 0) {
    await Transaction.create({
      name: "Saldo inicial",
      totalCents: openingBalance.amountCents,
      paidAt: dayStart(openingBalance.date),
      type: "incoming",
      walletId: wallet._id,
      workspaceId,
    })
  }
  return { id: wallet._id.toString() }
}
