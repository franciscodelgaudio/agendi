import { Types, type PipelineStage } from "mongoose";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";

export { BRT_OFFSET_HOURS, parseDay };

const DAY_MS = 24 * 60 * 60 * 1000;

// Chaves aceitas na URL e o campo correspondente no banco.
const SORT_PATHS = { performedAt: "performedAt", guestName: "guest.name", totalCents: "totalCents" } as const;
export const APPOINTMENT_PAGE_SIZE = 20;

export type AppointmentSortField = keyof typeof SORT_PATHS;
// from/to: dias de Brasília, ambos incluídos; vazios = sem limite. unit/therapist vazios = todos.
export type AppointmentListQuery = {
  q: string;
  sort: AppointmentSortField;
  dir: SortDir;
  unit: string;
  therapist: string;
  from: string;
  to: string;
  page: number;
};

function isSortField(value: string | undefined): value is AppointmentSortField {
  return value !== undefined && Object.hasOwn(SORT_PATHS, value);
}

function dayOrEmpty(value: string | undefined) {
  return value && parseDay(value) ? value : "";
}

function objectIdOrEmpty(value: string | undefined) {
  return value && /^[0-9a-f]{24}$/i.test(value) ? value : "";
}

// Início do dia de Brasília em UTC; espera um dia já validado.
function dayStart(value: string) {
  const [year, month, day] = parseDay(value)!;
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
}

export function parseAppointmentListQuery(params: SearchParams): AppointmentListQuery {
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "performedAt",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    unit: objectIdOrEmpty(first(params.unit)),
    therapist: objectIdOrEmpty(first(params.therapist)),
    from: dayOrEmpty(first(params.from)),
    to: dayOrEmpty(first(params.to)),
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

// Uma página da lista, a quantidade de tudo que passou pela busca e pelos filtros e a soma dos totais.
export type AppointmentPage<Row> = { rows: Row[]; total: number; totalCents: number };

// Etapas para o $lookup de appointments a partir das unidades; os filtros só estreitam o
// resultado, a restrição ao workspace/unidade vem do $lookup. Termina num único AppointmentPage.
export function appointmentSearchPipeline({ q, sort, dir, unit, therapist, from, to, page }: AppointmentListQuery) {
  const match: Record<string, unknown> = {};
  if (from || to) {
    const performedAt: Record<string, Date> = {};
    if (from) performedAt.$gte = dayStart(from);
    if (to) performedAt.$lt = new Date(dayStart(to).getTime() + DAY_MS);
    match.performedAt = performedAt;
  }
  if (unit) match.unitId = new Types.ObjectId(unit);
  // Qualquer um dos serviços feito pelo profissional.
  if (therapist) match["items.therapistId"] = new Types.ObjectId(therapist);
  const stages: Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>[] = [];
  if (Object.keys(match).length) stages.push({ $match: match });
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    stages.push({
      $match: {
        $or: [
          { "guest.name": regex },
          { "guest.room": regex },
          { "items.therapistName": regex },
          { "items.serviceName": regex },
        ],
      },
    });
  }
  stages.push(
    // O total vem antes da ordenação para que seja possível ordenar por ele.
    { $set: { totalCents: { $sum: "$items.priceCents" } } },
    { $sort: { [SORT_PATHS[sort]]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * APPOINTMENT_PAGE_SIZE },
          { $limit: APPOINTMENT_PAGE_SIZE },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              unitId: { $toString: "$unitId" },
              performedAt: 1,
              guest: 1,
              items: {
                $map: {
                  input: "$items",
                  as: "item",
                  in: {
                    serviceId: { $toString: "$$item.serviceId" },
                    serviceName: "$$item.serviceName",
                    priceCents: "$$item.priceCents",
                    durationMinutes: "$$item.durationMinutes",
                    therapistId: { $toString: "$$item.therapistId" },
                    therapistName: "$$item.therapistName",
                  },
                },
              },
              // Produtos escolhidos, para pré-marcar na edição.
              productIds: { $map: { input: "$products", as: "product", in: { $toString: "$$product.productId" } } },
              totalCents: 1,
            },
          },
        ],
        summary: [{ $group: { _id: null, n: { $sum: 1 }, totalCents: { $sum: "$totalCents" } } }],
      },
    },
    {
      $project: {
        rows: 1,
        total: { $ifNull: [{ $first: "$summary.n" }, 0] },
        totalCents: { $ifNull: [{ $first: "$summary.totalCents" }, 0] },
      },
    },
  );
  return stages;
}
