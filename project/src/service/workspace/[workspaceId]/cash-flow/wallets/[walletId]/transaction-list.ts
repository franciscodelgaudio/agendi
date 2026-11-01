import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction";

export const TRANSACTION_PAGE_SIZE = 20;
const STATUSES = ["paid", "pending"] as const;
const SORT_FIELDS = { paidAt: "paidAt", name: "name", total: "totalCents" } as const;

export type TransactionStatus = (typeof STATUSES)[number];
export type TransactionSortField = keyof typeof SORT_FIELDS;
export type TransactionListQuery = {
  q: string;
  type: TransactionType | "";
  status: TransactionStatus | "";
  sort: TransactionSortField;
  dir: SortDir;
  page: number;
};

export type TransactionListItem = {
  id: string;
  name: string;
  totalCents: number;
  type: TransactionType;
  paidAt: Date | null;
  fromAppointment: boolean;
};

export type TransactionListPage = { rows: TransactionListItem[]; total: number };

function isSortField(value: string | undefined): value is TransactionSortField {
  return value !== undefined && Object.hasOwn(SORT_FIELDS, value);
}

export function parseTransactionListQuery(params: SearchParams): TransactionListQuery {
  const type = first(params.type);
  const status = first(params.status);
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    type: TRANSACTION_TYPES.includes(type as TransactionType) ? (type as TransactionType) : "",
    status: STATUSES.includes(status as TransactionStatus) ? (status as TransactionStatus) : "",
    sort: isSortField(sort) ? sort : "paidAt",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function transactionListPipeline(
  walletId: string,
  { q, type, status, sort, dir, page }: TransactionListQuery,
  unitId?: string,
): PipelineStage[] {
  const match: Record<string, unknown> = { walletId: new Types.ObjectId(walletId) };
  if (unitId) match.unitId = new Types.ObjectId(unitId);
  if (type) match.type = type;
  if (status === "paid") match.paidAt = { $ne: null };
  if (status === "pending") match.paidAt = null;
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };

  return [
    { $match: match },
    { $sort: { [SORT_FIELDS[sort]]: dir === "desc" ? -1 : 1, _id: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * TRANSACTION_PAGE_SIZE },
          { $limit: TRANSACTION_PAGE_SIZE },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              totalCents: 1,
              type: 1,
              paidAt: 1,
              fromAppointment: { $ne: [{ $ifNull: ["$appointmentId", null] }, null] },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}

export type TransactionTotals = { incomingCents: number; expenseCents: number; balanceCents: number };

function paidSum(type: TransactionType) {
  return { $sum: { $cond: [{ $eq: ["$type", type] }, "$totalCents", 0] } };
}

export function transactionTotalsPipeline(walletId: string, unitId: string): PipelineStage[] {
  return [
    {
      $match: {
        walletId: new Types.ObjectId(walletId),
        unitId: new Types.ObjectId(unitId),
        paidAt: { $ne: null },
      },
    },
    { $group: { _id: null, incomingCents: paidSum("incoming"), expenseCents: paidSum("expense") } },
    {
      $project: {
        _id: 0,
        incomingCents: 1,
        expenseCents: 1,
        balanceCents: { $subtract: ["$incomingCents", "$expenseCents"] },
      },
    },
  ];
}
