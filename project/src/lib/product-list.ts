import { Types, type PipelineStage } from "mongoose";
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

// Valor do estoque: quantidade × preço de cada lote de cada item.
const LOTS_VALUE = {
  $sum: {
    $map: {
      input: "$items",
      as: "item",
      in: {
        $sum: {
          $map: {
            input: { $ifNull: ["$$item.lots", []] },
            as: "lot",
            in: { $multiply: ["$$lot.quantity", "$$lot.unitCostCents"] },
          },
        },
      },
    },
  },
};

// Preço do lote mais antigo do item (os lotes ficam em ordem de compra).
const NEXT_UNIT_COST = {
  $ifNull: [{ $getField: { field: "unitCostCents", input: { $first: { $first: "$items.lots" } } } }, null],
};

// Etapas sobre os produtos do catálogo, com a quantidade dos itens de estoque. Com holderId
// (o estoque da unidade ou o compartilhado), só os produtos que estão nele, com a quantidade de
// lá; sem, todos do catálogo, com a soma de todos os estoques.
export function productListPipeline({ q, sort, dir }: ProductListQuery, holderId?: string) {
  const stages: PipelineStage.FacetPipelineStage[] = [];
  if (q) stages.push({ $match: { name: { $regex: escapeRegex(q), $options: "i" } } });
  stages.push({
    $lookup: {
      from: "stock_items",
      localField: "_id",
      foreignField: "productId",
      as: "items",
      pipeline: holderId ? [{ $match: { holderId: new Types.ObjectId(holderId) } }] : [],
    },
  });
  if (holderId) stages.push({ $match: { items: { $ne: [] } } });
  stages.push(
    {
      $addFields: {
        quantity: { $sum: "$items.quantity" },
        valueCents: LOTS_VALUE,
        // Com vários estoques, não há um lote que sai agora.
        nextUnitCostCents: holderId ? NEXT_UNIT_COST : null,
      },
    },
    { $sort: { [sort]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        quantity: 1,
        valueCents: 1,
        nextUnitCostCents: 1,
        costCents: 1,
        notes: { $ifNull: ["$notes", null] },
        rating: { $ifNull: ["$rating", null] },
        avatarUrl: { $ifNull: ["$avatarUrl", null] },
      },
    },
  );
  return stages;
}
