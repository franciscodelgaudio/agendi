import { Types } from "mongoose"
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone"
import type { OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance"
import { appointmentTransaction } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction"
import { Appointment } from "@/models/Appointment"
import { Transaction } from "@/models/Transaction"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"

function dayStart(day: string) {
  const [year, month, date] = parseDay(day)!
  return new Date(Date.UTC(year, month - 1, date, BRT_OFFSET_HOURS))
}

export async function insertWallet({
  workspaceId,
  name,
  openingBalance,
}: {
  workspaceId: string
  name: string
  openingBalance: OpeningBalance | null
}) {
  const wallet = await Wallet.create({ name, workspaceId })
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

async function syncAppointmentTransaction(appointment: {
  _id: Types.ObjectId
  unitId: Types.ObjectId
  guest?: { name?: string | null } | null
  items: { priceCents: number }[]
  performedAt: Date
}) {
  const data = appointmentTransaction({
    guest: { name: appointment.guest?.name ?? "" },
    items: appointment.items,
    performedAt: appointment.performedAt,
  })
  if (!data) {
    await Transaction.deleteOne({ appointmentId: appointment._id })
    return
  }
  const unit = await Unit.findById(appointment.unitId).select({ walletId: 1, workspaceId: 1 }).lean()
  if (!unit?.walletId) return
  await Transaction.updateOne(
    { appointmentId: appointment._id },
    { $set: data, $setOnInsert: { walletId: unit.walletId, workspaceId: unit.workspaceId } },
    { upsert: true },
  )
}

export async function removeAppointmentTransaction(appointmentId: Types.ObjectId | string) {
  await Transaction.deleteOne({ appointmentId: new Types.ObjectId(appointmentId) })
}

export async function syncAppointmentTransactionById(appointmentId: Types.ObjectId | string) {
  const appointment = await Appointment.findById(appointmentId)
    .select({ unitId: 1, guest: 1, items: 1, performedAt: 1 })
    .lean()
  if (!appointment) {
    await removeAppointmentTransaction(appointmentId)
    return
  }
  await syncAppointmentTransaction(appointment)
}
