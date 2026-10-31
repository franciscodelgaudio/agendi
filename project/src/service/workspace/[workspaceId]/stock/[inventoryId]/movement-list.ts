import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";
import { MOVEMENT_TYPES, type MovementType } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/stock-movement";

export const MOVEMENT_PAGE_SIZE = 20;

export type MovementListQuery = { q: string; type: MovementType | ""; page: number };
export type MovementListItem = {
  id: string;
  name: string;
  type: MovementType;
  quantity: number;
  productName: string | null;
  createdAt: Date;
};
export type MovementListPage = { rows: MovementListItem[]; total: number };

export function parseMovementListQuery(params: SearchParams): MovementListQuery {
  const type = first(params.type);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    type: MOVEMENT_TYPES.includes(type as MovementType) ? (type as MovementType) : "",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function movementListPipeline(inventoryId: string, { q, type, page }: MovementListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { inventoryId: new Types.ObjectId(inventoryId) };
  if (type) match.type = type;
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };

  return [
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * MOVEMENT_PAGE_SIZE },
          { $limit: MOVEMENT_PAGE_SIZE },
          { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              type: 1,
              quantity: 1,
              productName: { $ifNull: [{ $first: "$product.name" }, null] },
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
