import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";
import { parseListPage } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list";

export const INVENTORY_PAGE_SIZE = 20;
const UNIT_FILTERS = ["linked", "unlinked"] as const;
const SORT_FIELDS = { name: "name", products: "productCount", quantity: "quantity" } as const;

export type InventoryUnitFilter = (typeof UNIT_FILTERS)[number];
export type InventorySortField = keyof typeof SORT_FIELDS;
export type InventoryListQuery = {
  q: string;
  unit: InventoryUnitFilter | "";
  sort: InventorySortField;
  dir: SortDir;
  page: number;
};
export type InventoryListItem = {
  id: string;
  name: string;
  units: { id: string; name: string }[];
  productCount: number;
  quantity: number;
};
export type InventoryListPage = { rows: InventoryListItem[]; total: number };

function isSortField(value: string | undefined): value is InventorySortField {
  return value !== undefined && Object.hasOwn(SORT_FIELDS, value);
}

export function parseInventoryListQuery(params: SearchParams): InventoryListQuery {
  const unit = first(params.unit);
  const sort = first(params.sort);
  return {
    q: first(params.q)?.trim() ?? "",
    unit: UNIT_FILTERS.includes(unit as InventoryUnitFilter) ? (unit as InventoryUnitFilter) : "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: parseListPage(params),
  };
}

export function inventoryListPipeline(workspaceId: string, { q, unit, sort, dir, page }: InventoryListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };

  return [
    { $match: match },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "inventoryId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    ...(unit ? [{ $match: unit === "linked" ? { units: { $ne: [] } } : { units: [] } }] : []),
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        units: 1,
        productCount: { $size: { $filter: { input: "$products", cond: { $gt: ["$$this.quantity", 0] } } } },
        quantity: { $sum: "$products.quantity" },
      },
    },
    { $sort: { [SORT_FIELDS[sort]]: dir === "desc" ? -1 : 1, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * INVENTORY_PAGE_SIZE }, { $limit: INVENTORY_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
