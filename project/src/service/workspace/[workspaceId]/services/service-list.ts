import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";

export const SERVICE_PAGE_SIZE = 20;
const SORT_FIELDS = { name: "name", price: "priceCents", duration: "durationMinutes" } as const;

export type ServiceSortField = keyof typeof SORT_FIELDS;
export type ServiceListQuery = { q: string; sort: ServiceSortField; dir: SortDir; page: number };
export type ServiceListItem = { id: string; name: string; durationMinutes: number; priceCents: number };
export type ServiceListPage = { rows: ServiceListItem[]; total: number };

function isSortField(value: string | undefined): value is ServiceSortField {
  return value !== undefined && Object.hasOwn(SORT_FIELDS, value);
}

export function parseServiceListQuery(params: SearchParams): ServiceListQuery {
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function serviceListPipeline(workspaceId: string, unitId: string, { q, sort, dir, page }: ServiceListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), unitId: new Types.ObjectId(unitId) };
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };

  return [
    { $match: match },
    { $sort: { [SORT_FIELDS[sort]]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * SERVICE_PAGE_SIZE },
          { $limit: SERVICE_PAGE_SIZE },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, durationMinutes: 1, priceCents: 1 } },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
