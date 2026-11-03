import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";

export const RECEIVABLE_PAGE_SIZE = 20;

export type PendingReceivable = { id: string; name: string; valueCents: number; accruedAt: Date; unitName?: string | null };
export type PendingReceivablePage = { rows: PendingReceivable[]; total: number; totalCents: number };

export type StatementListItem = {
  id: string;
  name: string;
  createdAt: Date;
  from: Date | null;
  to: Date;
  grossCents: number;
  shareBps: number;
  count: number;
  partnerName: string | null;
  paidAt: Date;
  totalCents: number;
};
export type StatementPeriod = { name: string; from: string | null; to: string };
export type StatementListPage = { rows: StatementListItem[]; total: number };
export type PendingDay = { unitId: string | null; day: string; count: number; cents: number; unitName?: string | null };

export function parseListPage(params: SearchParams) {
  const page = first(params.page);
  return page && /^[1-9]\d*$/.test(page) ? Number(page) : 1;
}

const STATEMENT_CHECKS = ["match", "diff"] as const;
export type StatementCheck = (typeof STATEMENT_CHECKS)[number];
export type StatementFilters = { q: string; check: StatementCheck | "" };

export function parseStatementListQuery(params: SearchParams): StatementFilters & { page: number } {
  const check = first(params.check);
  return {
    q: first(params.q)?.trim() ?? "",
    check: STATEMENT_CHECKS.includes(check as StatementCheck) ? (check as StatementCheck) : "",
    page: parseListPage(params),
  };
}

const EXPECTED_NET = {
  $subtract: ["$grossCents", { $floor: { $add: [{ $divide: [{ $multiply: ["$grossCents", "$shareBps"] }, 10_000] }, 0.5] } }],
};

function checkStages(check: StatementCheck | ""): PipelineStage[] {
  if (!check) return [];
  const received = { $first: "$transaction.totalCents" };
  return [
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
        pipeline: [{ $project: { _id: 0, totalCents: 1 } }],
      },
    },
    { $match: { $expr: { [check === "match" ? "$eq" : "$ne"]: [received, EXPECTED_NET] } } },
  ];
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

export const NOT_SETTLED = [
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
  {
    $lookup: {
      from: "transactions",
      localField: "_id",
      foreignField: "receivableId",
      as: "transactions",
      pipeline: [{ $project: { _id: 1 } }],
    },
  },
  { $match: { transactions: { $size: 0 } } },
];

function paged(page: number) {
  return [{ $skip: (page - 1) * RECEIVABLE_PAGE_SIZE }, { $limit: RECEIVABLE_PAGE_SIZE }];
}

const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };

export function pendingReceivablesPipeline(walletId: string, unitId: string | null, page: number): PipelineStage[] {
  return [
    scopeMatch(walletId, unitId),
    ...NOT_SETTLED,
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

function brasiliaDay(field: string) {
  return { $dateToString: { format: "%Y-%m-%d", date: field, timezone: "-03:00" } };
}

export function statementListPipeline(
  scope: { partnerId: string } | { walletId: string },
  page: number,
  { q, check }: StatementFilters = { q: "", check: "" },
): PipelineStage[] {
  const match: Record<string, unknown> =
    "partnerId" in scope ? { partnerId: new Types.ObjectId(scope.partnerId) } : { walletId: new Types.ObjectId(scope.walletId) };
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };
  return [
    { $match: match },
    ...checkStages(check),
    { $sort: { to: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          ...paged(page),
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
              pipeline: [{ $project: { _id: 0, name: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              createdAt: 1,
              from: 1,
              to: 1,
              grossCents: 1,
              shareBps: 1,
              count: { $size: "$receivableIds" },
              partnerName: { $ifNull: [{ $first: "$partner.name" }, null] },
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

export function partnerPeriodsPipeline(partnerId: string): PipelineStage[] {
  return [
    { $match: { partnerId: new Types.ObjectId(partnerId) } },
    { $sort: { to: 1, _id: 1 } },
    { $project: { _id: 0, name: 1, from: brasiliaDay("$from"), to: brasiliaDay("$to") } },
  ];
}

export function pendingByDayPipeline(walletId: string, unitId: string | null): PipelineStage[] {
  const project = {
    _id: 0,
    unitId: { $toString: "$_id.unitId" },
    day: "$_id.day",
    count: 1,
    cents: 1,
  };
  return [
    scopeMatch(walletId, unitId),
    ...NOT_SETTLED,
    {
      $group: {
        _id: {
          unitId: "$unitId",
          day: brasiliaDay("$accruedAt"),
        },
        count: { $sum: 1 },
        cents: { $sum: "$valueCents" },
      },
    },
    ...(unitId
      ? [{ $project: project }, { $sort: { day: 1 as const } }]
      : [
          { $lookup: { ...UNIT_LOOKUP.$lookup, localField: "_id.unitId" } },
          { $project: { ...project, unitName: UNIT_NAME } },
          { $sort: { day: 1 as const, unitName: 1 as const } },
        ]),
  ];
}
