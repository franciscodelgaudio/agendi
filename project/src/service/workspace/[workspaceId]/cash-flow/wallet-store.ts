import { Types } from "mongoose"
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone"
import type { OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance"
import { appointmentTransaction } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction"
import { Appointment } from "@/models/Appointment"
import { Customer } from "@/models/Customer"
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

export async function recordAppointmentIncome(appointmentId: string, priceCents: number) {
  const appointment = await Appointment.findById(appointmentId)
    .select({ name: 1, startsAt: 1, unitId: 1, customerId: 1 })
    .lean()
  if (!appointment) return
  const [unit, customer] = await Promise.all([
    Unit.findById(appointment.unitId).select({ walletId: 1, workspaceId: 1 }).lean(),
    Customer.findById(appointment.customerId).select({ name: 1 }).lean(),
  ])
  const data = appointmentTransaction({
    name: appointment.name,
    customerName: customer?.name ?? null,
    priceCents,
    startsAt: appointment.startsAt,
  })
  if (!data || !unit?.walletId) return
  await Transaction.updateOne(
    { appointmentId: appointment._id },
    { $set: data, $setOnInsert: { walletId: unit.walletId, workspaceId: unit.workspaceId } },
    { upsert: true },
  )
}

export async function removeAppointmentIncome(appointmentId: Types.ObjectId | string) {
  await Transaction.deleteOne({ appointmentId: new Types.ObjectId(appointmentId) })
}
