import { Types, type PipelineStage } from "mongoose";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";
import { parseListPage } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list";

export const PARTNER_PAGE_SIZE = 20;
const UNIT_FILTERS = ["linked", "unlinked"] as const;

export type PartnerUnitFilter = (typeof UNIT_FILTERS)[number];
export type PartnerListQuery = { q: string; unit: PartnerUnitFilter | ""; page: number };

export function parsePartnerListQuery(params: SearchParams): PartnerListQuery {
  const unit = first(params.unit);
  return {
    q: first(params.q)?.trim() ?? "",
    unit: UNIT_FILTERS.includes(unit as PartnerUnitFilter) ? (unit as PartnerUnitFilter) : "",
    page: parseListPage(params),
  };
}

export function partnerListPipeline(workspaceId: string, { q, unit, page }: PartnerListQuery): PipelineStage[] {
  const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
  if (q) match.name = { $regex: accentInsensitivePattern(q), $options: "i" };
  if (unit) match.unitId = unit === "linked" ? { $ne: null } : null;

  return [
    { $match: match },
    { $sort: { name: 1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * PARTNER_PAGE_SIZE },
          { $limit: PARTNER_PAGE_SIZE },
          {
            $lookup: {
              from: "units",
              localField: "unitId",
              foreignField: "_id",
              as: "unit",
              pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              imageUrl: { $ifNull: ["$imageUrl", null] },
              thresholdRule: 1,
              tiers: { $map: { input: "$tiers", in: { thresholdCents: "$$this.thresholdCents", shareBps: "$$this.shareBps" } } },
              unit: { $ifNull: [{ $first: "$unit" }, null] },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
