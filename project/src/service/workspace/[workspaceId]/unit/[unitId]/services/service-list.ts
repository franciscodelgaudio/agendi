import type { PipelineStage } from "mongoose";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";

export const SERVICE_SORT_FIELDS = ["name", "priceCents", "durationMinutes"] as const;

export type ServiceSortField = (typeof SERVICE_SORT_FIELDS)[number];
export type ServiceListQuery = { q: string; sort: ServiceSortField; dir: SortDir };

function isSortField(value: string | undefined): value is ServiceSortField {
  return SERVICE_SORT_FIELDS.includes(value as ServiceSortField);
}

export function parseServiceListQuery(params: SearchParams): ServiceListQuery {
  const sort = first(params.sort);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
  };
}

// Serviço ativo: sem deactivatedAt (ausente ou null).
export const ACTIVE_SERVICE = { $eq: [{ $ifNull: ["$deactivatedAt", null] }, null] };

// Etapas para a pipeline do $lookup de services da unidade. withActive: projeta active, para a
// tela de serviços marcar os desativados.
export function serviceListPipeline({ q, sort, dir }: ServiceListQuery, { withActive = false } = {}) {
  const stages: PipelineStage.FacetPipelineStage[] = [];
  if (q) stages.push({ $match: { name: { $regex: escapeRegex(q), $options: "i" } } });
  stages.push(
    { $sort: { [sort]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        priceCents: 1,
        durationMinutes: 1,
        // Produtos padrão, para pré-marcar na edição.
        productIds: { $map: { input: "$productIds", as: "id", in: { $toString: "$$id" } } },
        // Serviço cadastrado antes desses campos exige profissional e aceita qualquer espaço.
        requiresTherapist: { $ifNull: ["$requiresTherapist", true] },
        treatmentRoomIds: { $map: { input: { $ifNull: ["$treatmentRoomIds", []] }, as: "id", in: { $toString: "$$id" } } },
        ...(withActive && { active: ACTIVE_SERVICE }),
      },
    },
  );
  return stages;
}
