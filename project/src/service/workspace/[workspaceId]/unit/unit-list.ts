import type { PipelineStage } from "mongoose";

export const UNIT_SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;

export type UnitSortField = (typeof UNIT_SORT_FIELDS)[number];
export type SortDir = "asc" | "desc";
export type UnitListQuery = { q: string; sort: UnitSortField; dir: SortDir };

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isSortField(value: string | undefined): value is UnitSortField {
  return UNIT_SORT_FIELDS.includes(value as UnitSortField);
}

export function parseUnitListQuery(params: SearchParams): UnitListQuery {
  const sort = first(params.sort);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
  };
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Etapas para a pipeline do $lookup de units do workspace.
export function unitListPipeline({ q, sort, dir }: UnitListQuery) {
  const stages: PipelineStage.FacetPipelineStage[] = [];
  if (q) stages.push({ $match: { name: { $regex: escapeRegex(q), $options: "i" } } });
  stages.push(
    { $sort: { [sort]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        avatarUrl: { $ifNull: ["$avatarUrl", null] },
        // Unidades em espaço próprio não têm regra de repasse.
        revenueShare: { $ifNull: ["$revenueShare", null] },
        // Salas para o formulário de edição, com os ids em texto.
        treatmentRooms: {
          $map: {
            input: "$treatmentRooms",
            as: "room",
            in: { id: { $toString: "$$room._id" }, name: "$$room.name", beds: "$$room.beds" },
          },
        },
        businessHours: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
  return stages;
}
