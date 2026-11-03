import mongoose, { isObjectIdOrHexString, Types, type ClientSession } from "mongoose"
import { connectDB } from "@/service/_shared/database/mongoose"
import {
  NOT_SETTLED,
  partnerPeriodsPipeline,
  type StatementPeriod,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { appointmentReceivable } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable"
import type {
  PartnerToClose,
  PendingFilter,
  ReceivableTransaction,
  StatementData,
  StatementTransaction,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import { Appointment } from "@/models/Appointment"
import { Customer } from "@/models/Customer"
import { Partner } from "@/models/Partner"
import { Receivable } from "@/models/Receivable"
import { Statement } from "@/models/Statement"
import { Transaction } from "@/models/Transaction"
import { Unit } from "@/models/Unit"

class StatementAlreadyPaidError extends Error {}

async function inTransaction(work: (session: ClientSession) => Promise<void>) {
  await connectDB()
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(() => work(session))
  } finally {
    await session.endSession()
  }
}

function objectId(id: string | null) {
  return id ? new Types.ObjectId(id) : null
}

function transactionDoc(transaction: StatementTransaction | ReceivableTransaction) {
  return {
    ...transaction,
    walletId: new Types.ObjectId(transaction.walletId),
    unitId: objectId(transaction.unitId),
    workspaceId: new Types.ObjectId(transaction.workspaceId),
    receivableId: "receivableId" in transaction ? new Types.ObjectId(transaction.receivableId) : null,
  }
}

const NULLABLE_ID = (field: unknown) => ({ $cond: [{ $eq: [{ $ifNull: [field, null] }, null] }, null, { $toString: field }] })

export async function recordAppointmentReceivable(appointmentId: string, priceCents: number) {
  const appointment = await Appointment.findById(appointmentId)
    .select({ name: 1, startsAt: 1, unitId: 1, customer: 1 })
    .lean()
  if (!appointment) return
  const { customer } = appointment
  const [unit, registered] = await Promise.all([
    Unit.findById(appointment.unitId).select({ walletId: 1, workspaceId: 1 }).lean(),
    customer?.kind === "registered" ? Customer.findById(customer.customerId).select({ name: 1 }).lean() : null,
  ])
  const data = appointmentReceivable({
    name: appointment.name,
    customerName: customer?.kind === "guest" ? customer.name : (registered?.name ?? null),
    priceCents,
    startsAt: appointment.startsAt,
  })
  if (!data || !unit?.walletId) return
  await Receivable.updateOne(
    { appointmentId: appointment._id },
    { $set: data, $setOnInsert: { walletId: unit.walletId, unitId: appointment.unitId, workspaceId: unit.workspaceId } },
    { upsert: true },
  )
}

export async function removeAppointmentReceivable(appointmentId: string) {
  await Receivable.deleteOne({ appointmentId: new Types.ObjectId(appointmentId) })
}

export async function isAppointmentSettled(appointmentId: string) {
  const receivable = await Receivable.findOne({ appointmentId: new Types.ObjectId(appointmentId) }).select({ _id: 1 }).lean()
  if (!receivable) return false
  const [statement, transaction] = await Promise.all([
    Statement.exists({ receivableIds: receivable._id }),
    Transaction.exists({ receivableId: receivable._id }),
  ])
  return !!statement || !!transaction
}

export async function findPendingReceivables({ walletId, unitId, from, before }: PendingFilter) {
  return Receivable.aggregate<{ id: string; valueCents: number }>([
    {
      $match: {
        walletId: new Types.ObjectId(walletId),
        unitId: new Types.ObjectId(unitId),
        accruedAt: { ...(from && { $gte: from }), $lt: before },
      },
    },
    ...NOT_SETTLED,
    { $project: { _id: 0, id: { $toString: "$_id" }, valueCents: 1 } },
  ])
}

export async function findPendingReceivable(workspaceId: string, receivableId: string) {
  if (!isObjectIdOrHexString(receivableId)) return null
  const [receivable] = await Receivable.aggregate<{
    id: string
    name: string
    valueCents: number
    walletId: string
    unitId: string | null
    unitHasPartner: boolean
  }>([
    { $match: { _id: new Types.ObjectId(receivableId), workspaceId: new Types.ObjectId(workspaceId) } },
    ...NOT_SETTLED,
    {
      $lookup: {
        from: "partners",
        localField: "unitId",
        foreignField: "unitId",
        as: "partners",
        pipeline: [{ $project: { _id: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        valueCents: 1,
        walletId: { $toString: "$walletId" },
        unitId: NULLABLE_ID("$unitId"),
        unitHasPartner: { $gt: [{ $size: "$partners" }, 0] },
      },
    },
  ])
  return receivable ?? null
}

export async function saveStatement({
  statement,
  transaction,
}: {
  statement: StatementData
  transaction: StatementTransaction | null
}) {
  const statementId = new Types.ObjectId()
  await inTransaction(async (session) => {
    const [created] = transaction ? await Transaction.create([transactionDoc(transaction)], { session }) : [null]
    await Statement.create(
      [
        {
          ...statement,
          _id: statementId,
          partnerId: new Types.ObjectId(statement.partnerId),
          walletId: new Types.ObjectId(statement.walletId),
          workspaceId: new Types.ObjectId(statement.workspaceId),
          receivableIds: statement.receivableIds.map((id) => new Types.ObjectId(id)),
          transactionId: created?._id ?? null,
        },
      ],
      { session },
    )
  })
  return { id: statementId.toString() }
}

export async function saveReceivableTransaction(transaction: ReceivableTransaction) {
  const [created] = await Transaction.create([transactionDoc(transaction)])
  return { id: created._id.toString() }
}

export async function findPartnerToClose(workspaceId: string, partnerId: string): Promise<PartnerToClose | null> {
  if (!isObjectIdOrHexString(partnerId)) return null
  const partner = await Partner.findOne({ _id: partnerId, workspaceId: new Types.ObjectId(workspaceId) })
    .select({ thresholdRule: 1, tiers: 1, unitId: 1 })
    .lean()
  if (!partner) return null
  const unit = partner.unitId ? await Unit.findById(partner.unitId).select({ walletId: 1 }).lean() : null
  return {
    thresholdRule: partner.thresholdRule,
    tiers: partner.tiers.map(({ thresholdCents, shareBps }) => ({ thresholdCents, shareBps })),
    unit: unit ? { id: unit._id.toString(), walletId: unit.walletId?.toString() ?? null } : null,
  }
}

function statementFilter(workspaceId: string, statementId: string) {
  if (!isObjectIdOrHexString(statementId)) return null
  return { _id: new Types.ObjectId(statementId), workspaceId: new Types.ObjectId(workspaceId) }
}

export async function findStatementToPay(workspaceId: string, statementId: string) {
  const filter = statementFilter(workspaceId, statementId)
  if (!filter) return null
  const [statement] = await Statement.aggregate<{
    name: string
    walletId: string
    unitId: string | null
    workspaceId: string
    shareBps: number
    grossCents: number
    paid: boolean
  }>([
    { $match: filter },
    {
      $lookup: {
        from: "partners",
        localField: "partnerId",
        foreignField: "_id",
        as: "partner",
        pipeline: [{ $project: { _id: 0, unitId: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        name: 1,
        shareBps: 1,
        grossCents: 1,
        walletId: { $toString: "$walletId" },
        unitId: NULLABLE_ID({ $first: "$partner.unitId" }),
        workspaceId: { $toString: "$workspaceId" },
        paid: { $ne: [{ $ifNull: ["$transactionId", null] }, null] },
      },
    },
  ])
  return statement ?? null
}

export async function findStatementPaid(workspaceId: string, statementId: string) {
  const filter = statementFilter(workspaceId, statementId)
  const statement = filter && (await Statement.findOne(filter).select({ transactionId: 1 }).lean())
  return statement ? { paid: !!statement.transactionId } : null
}

export async function payStatementWith(workspaceId: string, statementId: string, transaction: StatementTransaction) {
  const filter = statementFilter(workspaceId, statementId)
  if (!filter) return false
  try {
    await inTransaction(async (session) => {
      const [created] = await Transaction.create([transactionDoc(transaction)], { session })
      const { matchedCount } = await Statement.updateOne(
        { ...filter, transactionId: null },
        { $set: { transactionId: created._id } },
        { session },
      )
      if (matchedCount === 0) throw new StatementAlreadyPaidError()
    })
    return true
  } catch (e) {
    if (e instanceof StatementAlreadyPaidError) return false
    throw e
  }
}

export async function removeUnpaidStatement(workspaceId: string, statementId: string) {
  const filter = statementFilter(workspaceId, statementId)
  if (!filter) return false
  return (await Statement.deleteOne({ ...filter, transactionId: null })).deletedCount > 0
}

export async function findReceivableToConfirm(appointmentId: string) {
  const [receivable] = await Receivable.aggregate<{ id: string; name: string; valueCents: number; accruedAt: Date }>([
    { $match: { appointmentId: new Types.ObjectId(appointmentId) } },
    ...NOT_SETTLED,
    {
      $lookup: {
        from: "partners",
        localField: "unitId",
        foreignField: "unitId",
        as: "partners",
        pipeline: [{ $project: { _id: 1 } }],
      },
    },
    { $match: { partners: { $size: 0 } } },
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1 } },
  ])
  return receivable ?? null
}

export async function findPartnerPeriods(partnerIds: string[]) {
  const periods = await Promise.all(partnerIds.map((id) => Statement.aggregate<StatementPeriod>(partnerPeriodsPipeline(id))))
  return Object.fromEntries(partnerIds.map((id, index) => [id, periods[index]]))
}
