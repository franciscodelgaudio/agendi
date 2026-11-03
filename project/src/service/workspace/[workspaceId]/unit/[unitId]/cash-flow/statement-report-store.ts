import { isObjectIdOrHexString, Types } from "mongoose"
import type { StatementReportData } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement-report"
import { Statement } from "@/models/Statement"

function brasiliaDay(field: unknown) {
  return { $dateToString: { format: "%Y-%m-%d", date: field, timezone: "-03:00" } }
}

export async function findStatementReport(workspaceId: string, statementId: string) {
  if (!isObjectIdOrHexString(statementId)) return null
  const [statement] = await Statement.aggregate<StatementReportData>([
    { $match: { _id: new Types.ObjectId(statementId), workspaceId: new Types.ObjectId(workspaceId) } },
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
        pipeline: [{ $project: { _id: 0, totalCents: 1, paidAt: 1 } }],
      },
    },
    {
      $lookup: {
        from: "partners",
        localField: "partnerId",
        foreignField: "_id",
        as: "partner",
        pipeline: [
          {
            $lookup: {
              from: "units",
              localField: "unitId",
              foreignField: "_id",
              as: "unit",
              pipeline: [{ $project: { _id: 0, name: 1 } }],
            },
          },
          { $project: { _id: 0, name: 1, unitName: { $first: "$unit.name" } } },
        ],
      },
    },
    {
      $lookup: {
        from: "receivables",
        localField: "receivableIds",
        foreignField: "_id",
        as: "receivables",
        pipeline: [
          { $sort: { accruedAt: 1, _id: 1 } },
          { $project: { _id: 0, day: brasiliaDay("$accruedAt"), name: 1, valueCents: 1 } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        name: 1,
        partnerName: { $ifNull: [{ $first: "$partner.name" }, null] },
        unitName: { $ifNull: [{ $first: "$partner.unitName" }, null] },
        from: { $cond: [{ $eq: [{ $ifNull: ["$from", null] }, null] }, null, brasiliaDay("$from")] },
        to: brasiliaDay("$to"),
        closedOn: brasiliaDay("$createdAt"),
        paidOn: { $cond: [{ $gt: [{ $size: "$transaction" }, 0] }, brasiliaDay({ $first: "$transaction.paidAt" }), null] },
        grossCents: 1,
        shareBps: 1,
        totalCents: { $ifNull: [{ $first: "$transaction.totalCents" }, null] },
        receivables: 1,
      },
    },
  ])
  return statement ?? null
}
