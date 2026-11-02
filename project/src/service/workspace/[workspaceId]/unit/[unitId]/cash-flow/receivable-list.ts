import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";

export const RECEIVABLE_PAGE_SIZE = 20;

export type PendingReceivable = { id: string; name: string; valueCents: number; accruedAt: Date };
export type PendingReceivablePage = { rows: PendingReceivable[]; total: number; totalCents: number };

export type StatementListItem = {
  id: string;
  name: string;
  closedAt: Date;
  passOnBps: number;
  count: number;
  grossCents: number;
  from: Date | null;
  to: Date | null;
  paidAt: Date | null;
  totalCents: number | null;
};
export type StatementListPage = { rows: StatementListItem[]; total: number };

export function parseListPage(params: SearchParams) {
  const page = first(params.page);
  return page && /^[1-9]\d*$/.test(page) ? Number(page) : 1;
}

function unitMatch(walletId: string, unitId: string) {
  return { $match: { walletId: new Types.ObjectId(walletId), unitId: new Types.ObjectId(unitId) } };
}

function paged(page: number) {
  return [{ $skip: (page - 1) * RECEIVABLE_PAGE_SIZE }, { $limit: RECEIVABLE_PAGE_SIZE }];
}

const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };

export function pendingReceivablesPipeline(walletId: string, unitId: string, page: number): PipelineStage[] {
  return [
    unitMatch(walletId, unitId),
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
    { $sort: { accruedAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          ...paged(page),
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1 } },
        ],
        total: [{ $count: "n" }],
        sum: [{ $group: { _id: null, cents: { $sum: "$valueCents" } } }],
      },
    },
    { $project: { rows: 1, total: TOTAL, totalCents: { $ifNull: [{ $first: "$sum.cents" }, 0] } } },
  ];
}

export function statementListPipeline(walletId: string, unitId: string, page: number): PipelineStage[] {
  return [
    unitMatch(walletId, unitId),
    { $sort: { closedAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          ...paged(page),
          {
            $lookup: {
              from: "receivables",
              localField: "receivableIds",
              foreignField: "_id",
              as: "receivables",
              pipeline: [{ $project: { _id: 0, valueCents: 1, accruedAt: 1 } }],
            },
          },
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
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              closedAt: 1,
              passOnBps: 1,
              count: { $size: "$receivables" },
              grossCents: { $sum: "$receivables.valueCents" },
              from: { $min: "$receivables.accruedAt" },
              to: { $max: "$receivables.accruedAt" },
              paidAt: { $ifNull: [{ $first: "$transaction.paidAt" }, null] },
              totalCents: { $ifNull: [{ $first: "$transaction.totalCents" }, null] },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: TOTAL } },
  ];
}
