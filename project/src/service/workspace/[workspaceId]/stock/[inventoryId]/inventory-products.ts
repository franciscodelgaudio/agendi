import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";

export const INVENTORY_PRODUCT_PAGE_SIZE = 20;
const SORT_FIELDS = ["name", "quantity"] as const;

export type InventoryProductSortField = (typeof SORT_FIELDS)[number];
export type InventoryProductsQuery = { q: string; sort: InventoryProductSortField; dir: SortDir; page: number };
export type InventoryProductItem = { id: string; name: string; priceCents: number; quantity: number };
export type InventoryProductsPage = { rows: InventoryProductItem[]; total: number };

export function parseInventoryProductsQuery(params: SearchParams): InventoryProductsQuery {
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: SORT_FIELDS.includes(sort as InventoryProductSortField) ? (sort as InventoryProductSortField) : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function inventoryProductsPipeline(
  inventoryId: string,
  { q, sort, dir, page }: InventoryProductsQuery,
): PipelineStage[] {
  return [
    { $match: { _id: new Types.ObjectId(inventoryId) } },
    { $unwind: "$products" },
    { $lookup: { from: "products", localField: "products.productId", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    {
      $project: {
        _id: 0,
        id: { $toString: "$product._id" },
        name: "$product.name",
        priceCents: "$product.priceCents",
        quantity: "$products.quantity",
      },
    },
    ...(q ? [{ $match: { name: { $regex: accentInsensitivePattern(q), $options: "i" } } }] : []),
    { $sort: { [sort]: dir === "desc" ? -1 : 1, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * INVENTORY_PRODUCT_PAGE_SIZE }, { $limit: INVENTORY_PRODUCT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
