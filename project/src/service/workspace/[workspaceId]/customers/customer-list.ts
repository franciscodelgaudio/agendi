import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";

export const CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_LIST_COLLATION = { locale: "pt", strength: 1 };
const SORT_FIELDS = ["name", "createdAt"] as const;

export type CustomerSortField = (typeof SORT_FIELDS)[number];
export type CustomerListQuery = { q: string; sort: CustomerSortField; dir: SortDir; page: number };

export type CustomerListItem = {
  id: string;
  name: string;
  observation: string | null;
  cellphone: string | null;
  createdAt: Date;
};

export type CustomerListPage = { rows: CustomerListItem[]; total: number };

export function parseCustomerListQuery(params: SearchParams): CustomerListQuery {
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: SORT_FIELDS.includes(sort as CustomerSortField) ? (sort as CustomerSortField) : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

function searchConditions(q: string) {
  const conditions: Record<string, unknown>[] = [{ name: { $regex: accentInsensitivePattern(q), $options: "i" } }];
  const digits = q.replace(/\D/g, "");
  if (digits) conditions.push({ cellphone: { $regex: digits, $options: "i" } });
  return conditions;
}

export function customerListPipeline(workspaceId: string, { q, sort, dir, page }: CustomerListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
  if (q) match.$or = searchConditions(q);

  return [
    { $match: match },
    { $sort: { [sort]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * CUSTOMER_PAGE_SIZE },
          { $limit: CUSTOMER_PAGE_SIZE },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              observation: { $ifNull: ["$observation", null] },
              cellphone: { $ifNull: ["$cellphone", null] },
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
