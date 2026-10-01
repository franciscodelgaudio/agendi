import { Types, type PipelineStage } from "mongoose";
import { parseDay } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list";
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";

const DAY_MS = 24 * 60 * 60 * 1000;

export const PRODUCT_HISTORY_PAGE_SIZE = 20;

// appointment: atendimento; booking: agendamento que ainda não virou atendimento; depletion: acabou.
export const PRODUCT_HISTORY_KINDS = ["appointment", "booking", "depletion"] as const;
export type ProductHistoryKind = (typeof PRODUCT_HISTORY_KINDS)[number];

// Chaves aceitas na URL e o campo correspondente nas linhas unificadas.
const SORT_PATHS = { at: "at", guestName: "guest.name" } as const;
export type ProductHistorySortField = keyof typeof SORT_PATHS;

// kind vazio = todos; from/to: dias de Brasília, ambos incluídos; vazios = sem limite.
export type ProductHistoryQuery = {
  q: string;
  kind: ProductHistoryKind | "";
  from: string;
  to: string;
  sort: ProductHistorySortField;
  dir: SortDir;
  page: number;
};

// Como sai de productHistoryPipeline; guest é null nas linhas de "acabou".
export type ProductHistoryRow = {
  id: string;
  kind: ProductHistoryKind;
  at: Date;
  guest: { name: string; room: string } | null;
  services: string[];
  therapists: string[];
};

export type ProductHistoryPage = { rows: ProductHistoryRow[]; total: number };

function isKind(value: string | undefined): value is ProductHistoryKind {
  return PRODUCT_HISTORY_KINDS.includes(value as ProductHistoryKind);
}

function isSortField(value: string | undefined): value is ProductHistorySortField {
  return value !== undefined && Object.hasOwn(SORT_PATHS, value);
}

function dayOrEmpty(value: string | undefined) {
  return value && parseDay(value) ? value : "";
}

// Início do dia de Brasília em UTC; espera um dia já validado.
function dayStart(value: string) {
  const [year, month, day] = parseDay(value)!;
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
}

export function parseProductHistoryQuery(params: SearchParams): ProductHistoryQuery {
  const kind = first(params.kind);
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    kind: isKind(kind) ? kind : "",
    from: dayOrEmpty(first(params.from)),
    to: dayOrEmpty(first(params.to)),
    sort: isSortField(sort) ? sort : "at",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

// Estoque do produto: holderId é o da unidade ou o compartilhado; unitIds, as unidades que usam.
export type ProductHistoryHolder = { holderId: string; unitIds: string[] };

// Pipeline para Appointment.aggregate: atendimentos com o produto nas unidades do estoque,
// agendamentos que ainda não viraram atendimento (o que virou já aparece pelo atendimento) e
// cada vez que o produto acabou nesse estoque, no mesmo formato. A posse do produto é
// conferida antes, por quem chama.
export function productHistoryPipeline(
  productId: string,
  holder: ProductHistoryHolder,
  { q, kind, from, to, sort, dir, page }: ProductHistoryQuery,
) {
  const id = new Types.ObjectId(productId);
  const unitId = { $in: holder.unitIds.map((unit) => new Types.ObjectId(unit)) };
  const stages: Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>[] = [
    { $match: { "products.productId": id, unitId } },
    {
      $project: {
        kind: { $literal: "appointment" },
        at: "$performedAt",
        guest: 1,
        services: "$items.serviceName",
        therapists: "$items.therapistName",
      },
    },
    {
      $unionWith: {
        coll: "bookings",
        pipeline: [
          { $match: { "products.productId": id, unitId, appointmentId: null } },
          {
            $project: {
              kind: { $literal: "booking" },
              at: "$startsAt",
              guest: 1,
              services: ["$service.serviceName"],
              therapists: ["$therapistName"],
            },
          },
        ],
      },
    },
    {
      $unionWith: {
        coll: "stock_items",
        pipeline: [
          { $match: { productId: id, holderId: new Types.ObjectId(holder.holderId) } },
          { $unwind: "$depletedAt" },
          {
            $project: {
              kind: { $literal: "depletion" },
              at: "$depletedAt",
              guest: null,
              services: [],
              therapists: [],
            },
          },
        ],
      },
    },
  ];

  const match: Record<string, unknown> = {};
  if (kind) match.kind = kind;
  if (from || to) {
    const at: Record<string, Date> = {};
    if (from) at.$gte = dayStart(from);
    if (to) at.$lt = new Date(dayStart(to).getTime() + DAY_MS);
    match.at = at;
  }
  if (Object.keys(match).length) stages.push({ $match: match });
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    stages.push({
      $match: { $or: [{ "guest.name": regex }, { "guest.room": regex }, { services: regex }, { therapists: regex }] },
    });
  }

  // As linhas de "acabou" repetem o _id do item de estoque, então kind entra no desempate.
  stages.push(
    { $sort: { [SORT_PATHS[sort]]: dir === "desc" ? -1 : 1, _id: 1, kind: 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * PRODUCT_HISTORY_PAGE_SIZE },
          { $limit: PRODUCT_HISTORY_PAGE_SIZE },
          { $project: { _id: 0, id: { $toString: "$_id" }, kind: 1, at: 1, guest: 1, services: 1, therapists: 1 } },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  );
  return stages;
}
