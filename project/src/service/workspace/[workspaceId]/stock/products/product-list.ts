import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";

export const PRODUCT_PAGE_SIZE = 20;
const SORT_FIELDS = { name: "name", price: "priceCents", quantity: "quantity" } as const;

export type ProductSortField = keyof typeof SORT_FIELDS;
export type ProductListQuery = { q: string; sort: ProductSortField; dir: SortDir; page: number };
export type ProductListItem = { id: string; name: string; priceCents: number; quantity: number };
export type ProductListPage = { rows: ProductListItem[]; total: number };

function isSortField(value: string | undefined): value is ProductSortField {
  return value !== undefined && Object.hasOwn(SORT_FIELDS, value);
}

export function parseProductListQuery(params: SearchParams): ProductListQuery {
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function productListPipeline(workspaceId: string, { q, sort, dir, page }: ProductListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };

  return [
    { $match: match },
    {
      $lookup: {
        from: "inventories",
        localField: "_id",
        foreignField: "products.productId",
        as: "inventories",
        pipeline: [{ $project: { _id: 0, products: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        priceCents: 1,
        quantity: {
          $sum: {
            $map: {
              input: "$inventories",
              as: "inventory",
              in: {
                $sum: {
                  $map: {
                    input: { $filter: { input: "$$inventory.products", cond: { $eq: ["$$this.productId", "$_id"] } } },
                    in: "$$this.quantity",
                  },
                },
              },
            },
          },
        },
      },
    },
    { $sort: { [SORT_FIELDS[sort]]: dir === "desc" ? -1 : 1, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * PRODUCT_PAGE_SIZE }, { $limit: PRODUCT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
