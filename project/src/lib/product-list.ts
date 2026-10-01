import type { PipelineStage } from "mongoose";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/lib/unit-list";

export const PRODUCT_SORT_FIELDS = ["name", "quantity", "costCents", "rating"] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type ProductListQuery = { q: string; sort: ProductSortField; dir: SortDir };

function isSortField(value: string | undefined): value is ProductSortField {
  return PRODUCT_SORT_FIELDS.includes(value as ProductSortField);
}

export function parseProductListQuery(params: SearchParams): ProductListQuery {
  const sort = first(params.sort);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
  };
}

// Etapas para a pipeline do $lookup de products da unidade.
export function productListPipeline({ q, sort, dir }: ProductListQuery) {
  const stages: PipelineStage.FacetPipelineStage[] = [];
  if (q) stages.push({ $match: { name: { $regex: escapeRegex(q), $options: "i" } } });
  stages.push(
    { $sort: { [sort]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        unitId: { $toString: "$unitId" },
        stockId: { $toString: "$stockId" },
        unitQuantities: {
          $map: {
            input: { $ifNull: ["$unitQuantities", []] },
            in: { unitId: { $toString: "$$this.unitId" }, quantity: "$$this.quantity" },
          },
        },
        name: 1,
        quantity: 1,
        costCents: 1,
        notes: { $ifNull: ["$notes", null] },
        rating: { $ifNull: ["$rating", null] },
        avatarUrl: { $ifNull: ["$avatarUrl", null] },
      },
    },
  );
  return stages;
}
