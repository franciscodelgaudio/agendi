import mongoose, { isObjectIdOrHexString, Types, type ClientSession } from "mongoose"
import { connectDB } from "@/service/_shared/database/mongoose"
import { appointmentReceivable } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable"
import type { StatementData, StatementTransaction } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import { Appointment } from "@/models/Appointment"
import { Customer } from "@/models/Customer"
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

function transactionDoc(transaction: StatementTransaction) {
  return {
    ...transaction,
    walletId: new Types.ObjectId(transaction.walletId),
    unitId: objectId(transaction.unitId),
    workspaceId: new Types.ObjectId(transaction.workspaceId),
  }
}

const NOT_IN_STATEMENT = [
  {
    $lookup: {
      from: "statements",
      localField: "_id",
      foreignField: "receivableIds",
      as: "statements",
      pipeline: [{ $project: { _id: 1 } }],
    },
  },
  { $match: { statements: { $size: 0 } } },
]

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
  return !!receivable && !!(await Statement.exists({ receivableIds: receivable._id }))
}

export async function findPendingReceivables({ walletId, unitId }: { walletId: string; unitId: string | null }) {
  return Receivable.aggregate<{ id: string; valueCents: number }>([
    { $match: { walletId: new Types.ObjectId(walletId), ...(unitId && { unitId: new Types.ObjectId(unitId) }) } },
    ...NOT_IN_STATEMENT,
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
  }>([
    { $match: { _id: new Types.ObjectId(receivableId), workspaceId: new Types.ObjectId(workspaceId) } },
    ...NOT_IN_STATEMENT,
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        valueCents: 1,
        walletId: { $toString: "$walletId" },
        unitId: { $cond: [{ $eq: [{ $ifNull: ["$unitId", null] }, null] }, null, { $toString: "$unitId" }] },
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
          walletId: new Types.ObjectId(statement.walletId),
          unitId: objectId(statement.unitId),
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
    passOnBps: number
    grossCents: number
    paid: boolean
  }>([
    { $match: filter },
    {
      $lookup: {
        from: "receivables",
        localField: "receivableIds",
        foreignField: "_id",
        as: "receivables",
        pipeline: [{ $project: { _id: 0, valueCents: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        name: 1,
        passOnBps: 1,
        walletId: { $toString: "$walletId" },
        unitId: { $cond: [{ $eq: [{ $ifNull: ["$unitId", null] }, null] }, null, { $toString: "$unitId" }] },
        workspaceId: { $toString: "$workspaceId" },
        grossCents: { $sum: "$receivables.valueCents" },
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
    ...NOT_IN_STATEMENT,
    {
      $lookup: {
        from: "wallets",
        localField: "walletId",
        foreignField: "_id",
        as: "wallet",
        pipeline: [{ $project: { _id: 0, settlement: 1 } }],
      },
    },
    { $match: { "wallet.settlement": { $ne: "statement" } } },
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1 } },
  ])
  return receivable ?? null
}
