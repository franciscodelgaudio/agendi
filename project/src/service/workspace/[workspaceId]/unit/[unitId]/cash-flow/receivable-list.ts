import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";

export const RECEIVABLE_PAGE_SIZE = 20;

export type PendingReceivable = { id: string; name: string; valueCents: number; accruedAt: Date; unitName?: string | null };
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
  unitName?: string | null;
};
export type StatementListPage = { rows: StatementListItem[]; total: number };
export type PendingByUnit = { unitId: string | null; unitName: string | null; count: number; cents: number };

export function parseListPage(params: SearchParams) {
  const page = first(params.page);
  return page && /^[1-9]\d*$/.test(page) ? Number(page) : 1;
}

function scopeMatch(walletId: string, unitId: string | null) {
  const match: Record<string, Types.ObjectId> = { walletId: new Types.ObjectId(walletId) };
  if (unitId) match.unitId = new Types.ObjectId(unitId);
  return { $match: match };
}

const UNIT_LOOKUP = {
  $lookup: {
    from: "units",
    localField: "unitId",
    foreignField: "_id",
    as: "unit",
    pipeline: [{ $project: { _id: 0, name: 1 } }],
  },
};
const UNIT_NAME = { $ifNull: [{ $first: "$unit.name" }, null] };

function withUnitName(unitId: string | null, project: Record<string, unknown>) {
  return unitId ? [{ $project: project }] : [UNIT_LOOKUP, { $project: { ...project, unitName: UNIT_NAME } }];
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
];

function paged(page: number) {
  return [{ $skip: (page - 1) * RECEIVABLE_PAGE_SIZE }, { $limit: RECEIVABLE_PAGE_SIZE }];
}

const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };

export function pendingReceivablesPipeline(walletId: string, unitId: string | null, page: number): PipelineStage[] {
  return [
    scopeMatch(walletId, unitId),
    ...NOT_IN_STATEMENT,
    { $sort: { accruedAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          ...paged(page),
          ...withUnitName(unitId, { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1 }),
        ],
        total: [{ $count: "n" }],
        sum: [{ $group: { _id: null, cents: { $sum: "$valueCents" } } }],
      },
    },
    { $project: { rows: 1, total: TOTAL, totalCents: { $ifNull: [{ $first: "$sum.cents" }, 0] } } },
  ];
}

export function statementListPipeline(walletId: string, unitId: string | null, page: number): PipelineStage[] {
  return [
    scopeMatch(walletId, unitId),
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
          ...withUnitName(unitId, {
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
          }),
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: TOTAL } },
  ];
}

export function pendingByUnitPipeline(walletId: string): PipelineStage[] {
  return [
    scopeMatch(walletId, null),
    ...NOT_IN_STATEMENT,
    { $group: { _id: "$unitId", count: { $sum: 1 }, cents: { $sum: "$valueCents" } } },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "_id",
        as: "unit",
        pipeline: [{ $project: { _id: 0, name: 1 } }],
      },
    },
    { $project: { _id: 0, unitId: { $toString: "$_id" }, unitName: UNIT_NAME, count: 1, cents: 1 } },
    { $sort: { unitName: 1 } },
  ];
}
