import { Types, type PipelineStage } from "mongoose";
import { parseDay } from "@/lib/appointment-list";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/lib/unit-list";
import { BRT_OFFSET_HOURS } from "@/lib/timezone";

const DAY_MS = 24 * 60 * 60 * 1000;
// A grade do mês mostra 6 semanas.
const MAX_RANGE_DAYS = 42;
const BRT_TIMEZONE = `-${String(BRT_OFFSET_HOURS).padStart(2, "0")}:00`;

// Dias de Brasília: start incluído, end excluído. unit/therapist vazios = todos.
export type BookingRange = { start: string; end: string; unit: string; therapist: string };

// Como sai de bookingListPipeline: datas no horário de Brasília ("2026-09-24T14:30").
export type BookingRow = {
  id: string;
  unitId: string;
  therapistId: string;
  therapistName: string;
  guest: { name: string; room: string };
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  service: { serviceId: string; serviceName: string };
  treatmentRoom: { roomId: string; roomName: string };
  productIds: string[];
  appointmentId: string | null;
  // Cor escolhida para o calendário; null usa a da massagista.
  color: string | null;
};

function objectIdOrEmpty(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? value : "";
}

// Início do dia de Brasília em UTC; null se o dia for inválido.
function dayStart(value: unknown) {
  const day = typeof value === "string" && parseDay(value);
  if (!day) return null;
  const [year, month, date] = day;
  return new Date(Date.UTC(year, month - 1, date, BRT_OFFSET_HOURS));
}

// Intervalo pedido pelo calendário; null se inválido, vazio ou maior que a grade do mês.
export function parseBookingRange(input: unknown): BookingRange | null {
  const { start, end, unit, therapist } = (input ?? {}) as Record<string, unknown>;
  const startDate = dayStart(start);
  const endDate = dayStart(end);
  if (!startDate || !endDate) return null;
  const days = (endDate.getTime() - startDate.getTime()) / DAY_MS;
  if (days <= 0 || days > MAX_RANGE_DAYS) return null;
  return { start: start as string, end: end as string, unit: objectIdOrEmpty(unit), therapist: objectIdOrEmpty(therapist) };
}

function brtDateTime(path: string) {
  return { $dateToString: { date: path, format: "%Y-%m-%dT%H:%M", timezone: BRT_TIMEZONE } };
}

// Linha no formato BookingRow, compartilhada pelo calendário e pela lista.
const BOOKING_PROJECT: PipelineStage.Project = {
  $project: {
    _id: 0,
    id: { $toString: "$_id" },
    unitId: { $toString: "$unitId" },
    therapistId: { $toString: "$therapistId" },
    therapistName: 1,
    guest: 1,
    startsAt: brtDateTime("$startsAt"),
    endsAt: brtDateTime("$endsAt"),
    durationMinutes: { $dateDiff: { startDate: "$startsAt", endDate: "$endsAt", unit: "minute" } },
    service: { serviceId: { $toString: "$service.serviceId" }, serviceName: "$service.serviceName" },
    treatmentRoom: { roomId: { $toString: "$treatmentRoom.roomId" }, roomName: "$treatmentRoom.roomName" },
    // Produtos escolhidos, para pré-marcar na edição e na conversão em atendimento.
    productIds: { $map: { input: "$products", as: "product", in: { $toString: "$$product.productId" } } },
    // Atendimento criado a partir do agendamento; null (ou ausente nos antigos) se ainda não virou.
    appointmentId: { $ifNull: [{ $toString: "$appointmentId" }, null] },
    // Cor escolhida para o calendário; null usa a cor da massagista.
    color: { $ifNull: ["$color", null] },
  },
};

// Etapas para o $lookup de bookings a partir das unidades do workspace; os filtros só
// estreitam o resultado, a restrição ao workspace vem do $lookup.
export function bookingListPipeline({ start, end, unit, therapist }: BookingRange) {
  const match: Record<string, unknown> = {
    startsAt: { $lt: dayStart(end) },
    endsAt: { $gt: dayStart(start) },
  };
  if (unit) match.unitId = new Types.ObjectId(unit);
  if (therapist) match.therapistId = new Types.ObjectId(therapist);
  const stages: PipelineStage.FacetPipelineStage[] = [
    { $match: match },
    { $sort: { startsAt: 1, _id: 1 } },
    BOOKING_PROJECT,
  ];
  return stages;
}

// Lista: chaves aceitas na URL e o campo correspondente no banco.
const SORT_PATHS = { startsAt: "startsAt", guestName: "guest.name", therapistName: "therapistName" } as const;
export const BOOKING_PAGE_SIZE = 20;
// pending: ainda não virou atendimento; done: já virou. Vazio = todos.
const STATUSES = ["pending", "done"] as const;

export type BookingSortField = keyof typeof SORT_PATHS;
export type BookingStatus = (typeof STATUSES)[number];
// from/to: dias de Brasília, ambos incluídos; vazios = sem limite.
export type BookingListQuery = {
  q: string;
  sort: BookingSortField;
  dir: SortDir;
  unit: string;
  therapist: string;
  status: BookingStatus | "";
  from: string;
  to: string;
  page: number;
};

// Uma página da lista e o total que passou pela busca e pelos filtros.
export type BookingPage = { rows: BookingRow[]; total: number };

function isSortField(value: string | undefined): value is BookingSortField {
  return value !== undefined && Object.hasOwn(SORT_PATHS, value);
}

function dayOrEmpty(value: string | undefined) {
  return value && parseDay(value) ? value : "";
}

export function parseBookingListQuery(params: SearchParams): BookingListQuery {
  const sort = first(params.sort);
  const status = first(params.status);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "startsAt",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    unit: objectIdOrEmpty(first(params.unit)),
    therapist: objectIdOrEmpty(first(params.therapist)),
    status: STATUSES.includes(status as BookingStatus) ? (status as BookingStatus) : "",
    from: dayOrEmpty(first(params.from)),
    to: dayOrEmpty(first(params.to)),
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

// Etapas para o $lookup de bookings a partir das unidades do workspace: todos, com busca e filtros,
// terminando num único documento BookingPage.
export function bookingSearchPipeline({ q, sort, dir, unit, therapist, status, from, to, page }: BookingListQuery) {
  const match: Record<string, unknown> = {};
  if (from || to) {
    const startsAt: Record<string, Date> = {};
    if (from) startsAt.$gte = dayStart(from)!;
    if (to) startsAt.$lt = new Date(dayStart(to)!.getTime() + DAY_MS);
    match.startsAt = startsAt;
  }
  if (unit) match.unitId = new Types.ObjectId(unit);
  if (therapist) match.therapistId = new Types.ObjectId(therapist);
  // null também pega os antigos sem o campo.
  if (status) match.appointmentId = status === "done" ? { $ne: null } : null;
  const stages: Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>[] = [];
  if (Object.keys(match).length) stages.push({ $match: match });
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    stages.push({
      $match: {
        $or: [{ "guest.name": regex }, { "guest.room": regex }, { therapistName: regex }, { "service.serviceName": regex }],
      },
    });
  }
  stages.push(
    { $sort: { [SORT_PATHS[sort]]: dir === "desc" ? -1 : 1, _id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * BOOKING_PAGE_SIZE }, { $limit: BOOKING_PAGE_SIZE }, BOOKING_PROJECT],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  );
  return stages;
}
