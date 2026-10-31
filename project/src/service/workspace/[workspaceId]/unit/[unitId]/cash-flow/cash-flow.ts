import type { PipelineStage } from "mongoose";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// week: um dia por linha; month: uma semana por linha; year: um mês por linha.
export const CASH_FLOW_VIEWS = ["week", "month", "year"] as const;

export type CashFlowView = (typeof CASH_FLOW_VIEWS)[number];
export type CashFlowQuery = { view: CashFlowView; date: string };
// Dias do calendário ("2026-09-24"), ambos inclusivos.
export type DayRange = { from: string; to: string };
export type DayTotal = { date: string; count: number; cents: number };

export type CashFlowAmounts = { grossCents: number; netCents: number };
export type CashFlowBucket = DayRange & { real: CashFlowAmounts; forecast: CashFlowAmounts };
export type CashFlowSummary = { buckets: CashFlowBucket[]; total: { real: CashFlowAmounts; forecast: CashFlowAmounts } };
export type ServiceTotal = { serviceId: string; serviceName: string; count: number; cents: number };
export type ServiceAmounts = { count: number; cents: number };
export type ServiceSummary = { serviceId: string; serviceName: string; real: ServiceAmounts; forecast: ServiceAmounts };
function isView(value: string | undefined): value is CashFlowView {
  return CASH_FLOW_VIEWS.includes(value as CashFlowView);
}

function toDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Date.UTC normaliza estouros: dia 0 é o último dia do mês anterior, mês 13 é janeiro seguinte.
function utcDay(year: number, month: number, day: number) {
  return toDay(new Date(Date.UTC(year, month - 1, day)));
}

function addDays(date: string, days: number) {
  const [year, month, day] = parseDay(date)!;
  return utcDay(year, month, day + days);
}

// Segunda-feira da semana do dia.
function weekStart(date: string) {
  const [year, month, day] = parseDay(date)!;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function parseCashFlowQuery(params: SearchParams, now = new Date()): CashFlowQuery {
  const view = first(params.view);
  const date = first(params.date);
  return {
    view: isView(view) ? view : "month",
    date: date && parseDay(date) ? date : toDay(new Date(now.getTime() - BRT_OFFSET_HOURS * HOUR_MS)),
  };
}

// Linhas da tabela do caixa para a visão escolhida.
export function cashFlowBuckets({ view, date }: CashFlowQuery): DayRange[] {
  const [year, month] = parseDay(date)!;
  if (view === "week") {
    const monday = weekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i);
      return { from: day, to: day };
    });
  }
  if (view === "year") {
    return Array.from({ length: 12 }, (_, i) => ({ from: utcDay(year, i + 1, 1), to: utcDay(year, i + 2, 0) }));
  }

  // Semanas de segunda a domingo, cortadas no início e no fim do mês.
  const last = utcDay(year, month + 1, 0);
  const buckets: DayRange[] = [];
  for (let from = utcDay(year, month, 1); from <= last; ) {
    const sunday = addDays(weekStart(from), 6);
    const to = sunday < last ? sunday : last;
    buckets.push({ from, to });
    from = addDays(to, 1);
  }
  return buckets;
}

// Início e fim (exclusivo) do intervalo em Brasília, em UTC.
function rangeBounds({ from, to }: DayRange) {
  const [year, month, day] = parseDay(from)!;
  const start = new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
  const [toYear, toMonth, toDate] = parseDay(to)!;
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDate, BRT_OFFSET_HOURS) + DAY_MS);
  return { start, end };
}

function dayKey(field: string) {
  return { $dateToString: { format: "%Y-%m-%d", date: field, timezone: "-03:00" } };
}

const PROJECT_DAY_TOTAL = { $project: { _id: 0, date: "$_id", count: 1, cents: 1 } };

const INCOME_LOOKUP = {
  $lookup: {
    from: "transactions",
    localField: "_id",
    foreignField: "appointmentId",
    as: "income",
    pipeline: [{ $project: { _id: 0, totalCents: 1 } }],
  },
};
const INCOME_CENTS = { $ifNull: [{ $first: "$income.totalCents" }, 0] };

const PRICE_LOOKUP = {
  $lookup: {
    from: "services",
    localField: "serviceId",
    foreignField: "_id",
    as: "services",
    pipeline: [{ $project: { _id: 0, name: 1, priceCents: 1 } }],
  },
};
const PRICE_CENTS = { $ifNull: [{ $first: "$services.priceCents" }, 0] };

function doneMatch(range: DayRange) {
  const { start, end } = rangeBounds(range);
  return { $match: { status: "done", startsAt: { $gte: start, $lt: end } } };
}

function scheduledMatch(range: DayRange, now: Date) {
  const { start, end } = rangeBounds(range);
  return { $match: { status: "scheduled", startsAt: { $gte: now > start ? now : start, $lt: end } } };
}

export function dailyDoneTotalsPipeline(range: DayRange): PipelineStage.FacetPipelineStage[] {
  return [
    doneMatch(range),
    INCOME_LOOKUP,
    { $group: { _id: dayKey("$startsAt"), count: { $sum: 1 }, cents: { $sum: INCOME_CENTS } } },
    PROJECT_DAY_TOTAL,
  ];
}

export function dailyScheduledForecastPipeline(range: DayRange, now: Date): PipelineStage.FacetPipelineStage[] {
  return [
    scheduledMatch(range, now),
    PRICE_LOOKUP,
    { $group: { _id: dayKey("$startsAt"), count: { $sum: 1 }, cents: { $sum: PRICE_CENTS } } },
    PROJECT_DAY_TOTAL,
  ];
}

const PROJECT_SERVICE_TOTAL = {
  $project: { _id: 0, serviceId: { $toString: "$_id" }, serviceName: 1, count: 1, cents: 1 },
};

export function serviceDoneTotalsPipeline(range: DayRange): PipelineStage.FacetPipelineStage[] {
  return [
    doneMatch(range),
    { $sort: { startsAt: 1 } },
    INCOME_LOOKUP,
    { $group: { _id: "$serviceId", serviceName: { $last: "$name" }, count: { $sum: 1 }, cents: { $sum: INCOME_CENTS } } },
    PROJECT_SERVICE_TOTAL,
  ];
}

export function serviceScheduledForecastPipeline(range: DayRange, now: Date): PipelineStage.FacetPipelineStage[] {
  return [
    scheduledMatch(range, now),
    PRICE_LOOKUP,
    {
      $group: {
        _id: "$serviceId",
        serviceName: { $last: { $ifNull: [{ $first: "$services.name" }, "$name"] } },
        count: { $sum: 1 },
        cents: { $sum: PRICE_CENTS },
      },
    },
    PROJECT_SERVICE_TOTAL,
  ];
}

// Real: atendimentos. Previsto: atendimentos mais agendamentos futuros, cujo nome é o atual.
export function summarizeServices(appointments: ServiceTotal[], bookings: ServiceTotal[]): ServiceSummary[] {
  const rows = new Map<string, ServiceSummary>();
  const row = ({ serviceId, serviceName }: ServiceTotal) => {
    const existing = rows.get(serviceId);
    if (existing) return existing;
    const created = { serviceId, serviceName, real: { count: 0, cents: 0 }, forecast: { count: 0, cents: 0 } };
    rows.set(serviceId, created);
    return created;
  };
  for (const total of appointments) {
    const summary = row(total);
    summary.real = { count: total.count, cents: total.cents };
    summary.forecast = { count: total.count, cents: total.cents };
  }
  for (const total of bookings) {
    const summary = row(total);
    summary.serviceName = total.serviceName;
    summary.forecast = { count: summary.forecast.count + total.count, cents: summary.forecast.cents + total.cents };
  }
  return [...rows.values()].sort(
    (a, b) => b.forecast.cents - a.forecast.cents || a.serviceName.localeCompare(b.serviceName, "pt-BR"),
  );
}

// Faturamento de cada dia, somando os profissionais.
function sumTotals(...lists: DayTotal[][]) {
  const totals = new Map<string, number>();
  for (const { date, cents } of lists.flat()) totals.set(date, (totals.get(date) ?? 0) + cents);
  return totals;
}

function bucketAmounts({ from, to }: DayRange, totals: Map<string, number>): CashFlowAmounts {
  let grossCents = 0;
  for (const [date, cents] of totals) {
    if (date >= from && date <= to) grossCents += cents;
  }
  return { grossCents, netCents: grossCents };
}

function addAmounts(a: CashFlowAmounts, b: CashFlowAmounts): CashFlowAmounts {
  return { grossCents: a.grossCents + b.grossCents, netCents: a.netCents + b.netCents };
}

// Real: atendimentos. Previsto: atendimentos mais agendamentos futuros.
export function summarizeCashFlow(buckets: DayRange[], appointments: DayTotal[], bookings: DayTotal[]): CashFlowSummary {
  const real = sumTotals(appointments);
  const forecast = sumTotals(appointments, bookings);

  const zero = { grossCents: 0, netCents: 0 };
  const rows = buckets.map((bucket) => ({
    ...bucket,
    real: bucketAmounts(bucket, real),
    forecast: bucketAmounts(bucket, forecast),
  }));
  return {
    buckets: rows,
    total: {
      real: rows.reduce((sum, row) => addAmounts(sum, row.real), zero),
      forecast: rows.reduce((sum, row) => addAmounts(sum, row.forecast), zero),
    },
  };
}
