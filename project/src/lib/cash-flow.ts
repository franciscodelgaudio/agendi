import type { PipelineStage } from "mongoose";
import { parseDay } from "@/lib/appointment-list";
import { calculatePartnerShareCents, type RevenueShare, type RevenueSharePeriod } from "@/lib/revenue-share";
import { BRT_OFFSET_HOURS } from "@/lib/timezone";
import { first, type SearchParams } from "@/lib/unit-list";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// week: um dia por linha; month: uma semana por linha; year: um mês por linha.
export const CASH_FLOW_VIEWS = ["week", "month", "year"] as const;

export type CashFlowView = (typeof CASH_FLOW_VIEWS)[number];
export type CashFlowQuery = { view: CashFlowView; date: string };
// Dias do calendário ("2026-09-24"), ambos inclusivos.
export type DayRange = { from: string; to: string };
// Faturamento de uma massagista num dia, com a quantidade de serviços.
export type DayTotal = { date: string; therapistId: string; therapistName: string; count: number; cents: number };
// Percentual de comissão por id de usuário da massagista; quem não está aqui não tem comissão.
export type CommissionRates = Record<string, number>;

export type CashFlowAmounts = { grossCents: number; partnerShareCents: number; commissionCents: number; netCents: number };
export type CashFlowBucket = DayRange & { real: CashFlowAmounts; forecast: CashFlowAmounts };
export type CashFlowSummary = { buckets: CashFlowBucket[]; total: { real: CashFlowAmounts; forecast: CashFlowAmounts } };
export type ServiceTotal = { serviceId: string; serviceName: string; count: number; cents: number };
export type ServiceAmounts = { count: number; cents: number };
export type ServiceSummary = { serviceId: string; serviceName: string; real: ServiceAmounts; forecast: ServiceAmounts };
export type TherapistAmounts = { count: number; cents: number; commissionCents: number };
export type TherapistSummary = {
  therapistId: string;
  therapistName: string;
  commissionPercent: number | null;
  real: TherapistAmounts;
  forecast: TherapistAmounts;
};

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

// Data do período anterior (steps < 0) ou seguinte; mês e ano vão para o primeiro dia.
export function shiftCashFlowDate({ view, date }: CashFlowQuery, steps: number) {
  const [year, month] = parseDay(date)!;
  if (view === "week") return addDays(date, 7 * steps);
  if (view === "month") return utcDay(year, month + steps, 1);
  return utcDay(year + steps, 1, 1);
}

// Mês do gráfico de gastos ("AAAA-MM" na URL) dentro do ano exibido, no primeiro dia. Sem mês
// válido, fica no de hoje; ano passado mostra dezembro e ano futuro, janeiro.
export function costMonthDate(param: string | string[] | undefined, shown: DayRange, today: string) {
  const chosen = `${first(param)}-01`;
  if (parseDay(chosen) && shown.from <= chosen && chosen <= shown.to) return chosen;
  const date = today < shown.from ? shown.from : today > shown.to ? shown.to : today;
  return `${date.slice(0, 7)}-01`;
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

// Período de repasse que contém o dia. Quinzenas: 1–15 e 16–fim do mês.
function sharePeriodOf(date: string, period: RevenueSharePeriod): DayRange {
  const [year, month, day] = parseDay(date)!;
  if (period === "weekly") {
    const monday = weekStart(date);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (period === "biweekly" && day <= 15) return { from: utcDay(year, month, 1), to: utcDay(year, month, 15) };
  if (period === "biweekly") return { from: utcDay(year, month, 16), to: utcDay(year, month + 1, 0) };
  return { from: utcDay(year, month, 1), to: utcDay(year, month + 1, 0) };
}

// Dias a buscar no banco: os exibidos mais o resto dos períodos de repasse das pontas,
// porque a faixa do repasse depende do faturamento do período inteiro.
export function cashFlowFetchRange(buckets: DayRange[], period: RevenueSharePeriod | null): DayRange {
  const from = buckets[0].from;
  const to = buckets.at(-1)!.to;
  if (!period) return { from, to };
  return { from: sharePeriodOf(from, period).from, to: sharePeriodOf(to, period).to };
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

const PROJECT_DAY_TOTAL = {
  $project: {
    _id: 0,
    date: "$_id.date",
    therapistId: { $toString: "$_id.therapistId" },
    therapistName: 1,
    count: 1,
    cents: 1,
  },
};

// Etapas para o $lookup de appointments da unidade: faturamento por dia e massagista,
// com o nome do registro mais recente.
export function dailyAppointmentTotalsPipeline(range: DayRange): PipelineStage.FacetPipelineStage[] {
  const { start, end } = rangeBounds(range);
  return [
    { $match: { performedAt: { $gte: start, $lt: end } } },
    { $sort: { performedAt: 1 } },
    { $unwind: "$items" },
    {
      $group: {
        _id: { date: dayKey("$performedAt"), therapistId: "$items.therapistId" },
        therapistName: { $last: "$items.therapistName" },
        count: { $sum: 1 },
        cents: { $sum: "$items.priceCents" },
      },
    },
    PROJECT_DAY_TOTAL,
  ];
}

// Etapas para o $lookup de bookings da unidade: valor previsto por dia e massagista dos
// agendamentos de agora em diante, pelo preço atual do serviço.
export function dailyBookingForecastPipeline(range: DayRange, now: Date): PipelineStage.FacetPipelineStage[] {
  const { start, end } = rangeBounds(range);
  return [
    { $match: { startsAt: { $gte: now > start ? now : start, $lt: end } } },
    { $sort: { startsAt: 1 } },
    {
      $lookup: {
        from: "services",
        localField: "service.serviceId",
        foreignField: "_id",
        as: "services",
        pipeline: [{ $project: { _id: 0, priceCents: 1 } }],
      },
    },
    {
      $group: {
        _id: { date: dayKey("$startsAt"), therapistId: "$therapistId" },
        therapistName: { $last: "$therapistName" },
        count: { $sum: 1 },
        cents: { $sum: { $ifNull: [{ $first: "$services.priceCents" }, 0] } },
      },
    },
    PROJECT_DAY_TOTAL,
  ];
}

const PROJECT_SERVICE_TOTAL = {
  $project: { _id: 0, serviceId: { $toString: "$_id" }, serviceName: 1, count: 1, cents: 1 },
};

// Etapas para o $lookup de appointments da unidade: faturamento por serviço no intervalo.
export function serviceAppointmentTotalsPipeline(range: DayRange): PipelineStage.FacetPipelineStage[] {
  const { start, end } = rangeBounds(range);
  return [
    { $match: { performedAt: { $gte: start, $lt: end } } },
    { $sort: { performedAt: 1 } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.serviceId",
        serviceName: { $last: "$items.serviceName" },
        count: { $sum: 1 },
        cents: { $sum: "$items.priceCents" },
      },
    },
    PROJECT_SERVICE_TOTAL,
  ];
}

// Etapas para o $lookup de bookings da unidade: valor previsto por serviço dos agendamentos
// de agora em diante, pelo nome e preço atuais do serviço.
export function serviceBookingForecastPipeline(range: DayRange, now: Date): PipelineStage.FacetPipelineStage[] {
  const { start, end } = rangeBounds(range);
  return [
    { $match: { startsAt: { $gte: now > start ? now : start, $lt: end } } },
    {
      $lookup: {
        from: "services",
        localField: "service.serviceId",
        foreignField: "_id",
        as: "services",
        pipeline: [{ $project: { _id: 0, name: 1, priceCents: 1 } }],
      },
    },
    {
      $group: {
        _id: "$service.serviceId",
        serviceName: { $last: { $ifNull: [{ $first: "$services.name" }, "$service.serviceName"] } },
        count: { $sum: 1 },
        cents: { $sum: { $ifNull: [{ $first: "$services.priceCents" }, 0] } },
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

// Repasse (sem arredondar) de cada dia: calculado sobre o período de repasse inteiro
// e rateado pelo faturamento de cada dia.
function partnerShareByDay(totals: Map<string, number>, revenueShare: RevenueShare | null) {
  const shares = new Map<string, number>();
  if (!revenueShare) return shares;

  const periodRevenue = new Map<string, number>();
  for (const [date, cents] of totals) {
    const key = sharePeriodOf(date, revenueShare.period).from;
    periodRevenue.set(key, (periodRevenue.get(key) ?? 0) + cents);
  }
  for (const [date, cents] of totals) {
    if (!cents) continue;
    const revenue = periodRevenue.get(sharePeriodOf(date, revenueShare.period).from)!;
    shares.set(date, (calculatePartnerShareCents(revenue, revenueShare) * cents) / revenue);
  }
  return shares;
}

// Faturamento e comissão (sem arredondar) de cada dia, somando as massagistas.
function sumTotals(rates: CommissionRates, ...lists: DayTotal[][]) {
  const totals = new Map<string, number>();
  const commissions = new Map<string, number>();
  for (const { date, therapistId, cents } of lists.flat()) {
    totals.set(date, (totals.get(date) ?? 0) + cents);
    commissions.set(date, (commissions.get(date) ?? 0) + (cents * (rates[therapistId] ?? 0)) / 100);
  }
  return { totals, commissions };
}

function bucketAmounts(
  { from, to }: DayRange,
  { totals, commissions }: ReturnType<typeof sumTotals>,
  shares: Map<string, number>,
): CashFlowAmounts {
  let grossCents = 0;
  let share = 0;
  let commission = 0;
  for (const [date, cents] of totals) {
    if (date < from || date > to) continue;
    grossCents += cents;
    share += shares.get(date) ?? 0;
    commission += commissions.get(date) ?? 0;
  }
  const partnerShareCents = Math.round(share);
  const commissionCents = Math.round(commission);
  return { grossCents, partnerShareCents, commissionCents, netCents: grossCents - partnerShareCents - commissionCents };
}

function addAmounts(a: CashFlowAmounts, b: CashFlowAmounts): CashFlowAmounts {
  return {
    grossCents: a.grossCents + b.grossCents,
    partnerShareCents: a.partnerShareCents + b.partnerShareCents,
    commissionCents: a.commissionCents + b.commissionCents,
    netCents: a.netCents + b.netCents,
  };
}

// Real: atendimentos. Previsto: atendimentos mais agendamentos futuros. Os dias fora dos
// intervalos só servem para o repasse; o total é a soma dos intervalos já arredondados.
// Repasse e comissão são calculados sobre o bruto e ambos saem do líquido.
export function summarizeCashFlow(
  buckets: DayRange[],
  appointments: DayTotal[],
  bookings: DayTotal[],
  revenueShare: RevenueShare | null,
  commissionRates: CommissionRates,
): CashFlowSummary {
  const real = sumTotals(commissionRates, appointments);
  const forecast = sumTotals(commissionRates, appointments, bookings);
  const realShares = partnerShareByDay(real.totals, revenueShare);
  const forecastShares = partnerShareByDay(forecast.totals, revenueShare);

  const zero = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, netCents: 0 };
  const rows = buckets.map((bucket) => ({
    ...bucket,
    real: bucketAmounts(bucket, real, realShares),
    forecast: bucketAmounts(bucket, forecast, forecastShares),
  }));
  return {
    buckets: rows,
    total: {
      real: rows.reduce((sum, row) => addAmounts(sum, row.real), zero),
      forecast: rows.reduce((sum, row) => addAmounts(sum, row.forecast), zero),
    },
  };
}

// Por massagista no intervalo exibido. Real: atendimentos. Previsto: atendimentos mais
// agendamentos futuros, cujo nome é o mais recente. Ordena pelo previsto.
export function summarizeTherapists(
  { from, to }: DayRange,
  appointments: DayTotal[],
  bookings: DayTotal[],
  commissionRates: CommissionRates,
): TherapistSummary[] {
  const rows = new Map<string, { therapistName: string; real: ServiceAmounts; forecast: ServiceAmounts }>();
  const row = ({ therapistId, therapistName }: DayTotal) => {
    const existing = rows.get(therapistId);
    if (existing) {
      existing.therapistName = therapistName;
      return existing;
    }
    const created = { therapistName, real: { count: 0, cents: 0 }, forecast: { count: 0, cents: 0 } };
    rows.set(therapistId, created);
    return created;
  };
  const add = (amounts: ServiceAmounts, { count, cents }: DayTotal) => {
    amounts.count += count;
    amounts.cents += cents;
  };
  const inRange = ({ date }: DayTotal) => date >= from && date <= to;

  for (const total of appointments.filter(inRange)) {
    const summary = row(total);
    add(summary.real, total);
    add(summary.forecast, total);
  }
  for (const total of bookings.filter(inRange)) add(row(total).forecast, total);

  return [...rows]
    .map(([therapistId, { therapistName, real, forecast }]) => {
      const commissionPercent = commissionRates[therapistId] ?? null;
      const withCommission = ({ count, cents }: ServiceAmounts) => ({
        count,
        cents,
        commissionCents: Math.round((cents * (commissionPercent ?? 0)) / 100),
      });
      return {
        therapistId,
        therapistName,
        commissionPercent,
        real: withCommission(real),
        forecast: withCommission(forecast),
      };
    })
    .sort((a, b) => b.forecast.cents - a.forecast.cents || a.therapistName.localeCompare(b.therapistName, "pt-BR"));
}

// Custos da equipe que não dependem de quem fez o serviço: comissão sobre o bruto
// (recepcionistas) e salários mensais, que somados à equipe toda saem do líquido.
// Cada salário (com os bônus) conta a partir da data de início; sem ela, conta sempre.
export type StaffSalary = { monthlyCents: number; startDate: string | null };
export type StaffCosts = { grossCommissionPercent: number; salaries: StaffSalary[]; today: string };
export type StaffCashFlowAmounts = CashFlowAmounts & { salaryCents: number };
export type StaffCashFlowBucket = DayRange & { real: StaffCashFlowAmounts; forecast: StaffCashFlowAmounts };
export type StaffCashFlowSummary = {
  buckets: StaffCashFlowBucket[];
  total: { real: StaffCashFlowAmounts; forecast: StaffCashFlowAmounts };
};

// Despesas lançadas na unidade: real conta só as pagas, previsto conta todas.
export type ExpenseCashFlowAmounts = StaffCashFlowAmounts & { expenseCents: number };
export type ExpenseCashFlowBucket = DayRange & { real: ExpenseCashFlowAmounts; forecast: ExpenseCashFlowAmounts };
export type ExpenseCashFlowSummary = {
  buckets: ExpenseCashFlowBucket[];
  total: { real: ExpenseCashFlowAmounts; forecast: ExpenseCashFlowAmounts };
};
export type ExpenseDayCents = { date: string; totalCents: number; paidCents: number };

function withExpenses(amounts: StaffCashFlowAmounts, expenseCents: number): ExpenseCashFlowAmounts {
  return { ...amounts, expenseCents, netCents: amounts.netCents - expenseCents };
}

// Cada despesa entra no intervalo do dia do lançamento; o total soma os intervalos.
export function applyExpenses(summary: StaffCashFlowSummary, expenses: ExpenseDayCents[]): ExpenseCashFlowSummary {
  const buckets = summary.buckets.map((bucket) => {
    let paid = 0;
    let total = 0;
    for (const expense of expenses) {
      if (expense.date < bucket.from || expense.date > bucket.to) continue;
      paid += expense.paidCents;
      total += expense.totalCents;
    }
    return { ...bucket, real: withExpenses(bucket.real, paid), forecast: withExpenses(bucket.forecast, total) };
  });
  const zero = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, expenseCents: 0, netCents: 0 };
  const add = (a: ExpenseCashFlowAmounts, b: ExpenseCashFlowAmounts) => ({
    ...addAmounts(a, b),
    salaryCents: a.salaryCents + b.salaryCents,
    expenseCents: a.expenseCents + b.expenseCents,
  });
  return {
    buckets,
    total: {
      real: buckets.reduce((sum, row) => add(sum, row.real), zero),
      forecast: buckets.reduce((sum, row) => add(sum, row.forecast), zero),
    },
  };
}

export type TeamPayMember = {
  userId?: { toString(): string } | null;
  role: string;
  units: {
    unitId: { toString(): string };
    commissionPercent?: number | null;
    salaryCents?: number | null;
    bonuses?: { amountCents: number }[];
    startDate?: string | null;
  }[];
};
export type TeamPayRates = Pick<StaffCosts, "grossCommissionPercent" | "salaries"> & {
  commissionRates: CommissionRates;
};

// Comissão de massagista vai pelo id de usuário, que identifica quem fez o serviço.
// Comissão de recepcionista é sobre o bruto; salário e bônus fixos mensais valem mesmo
// com convite pendente e entram juntos no custo mensal de cada vínculo.
export function teamPayRates(team: TeamPayMember[], unitId: string): TeamPayRates {
  const commissionRates: CommissionRates = {};
  let grossCommissionPercent = 0;
  const salaries: StaffSalary[] = [];
  for (const member of team) {
    if (member.role !== "massage_therapist" && member.role !== "receptionist") continue;
    const link = member.units.find((unit) => unit.unitId.toString() === unitId);
    let monthlyCents = link?.salaryCents ?? 0;
    for (const bonus of link?.bonuses ?? []) monthlyCents += bonus.amountCents;
    if (monthlyCents > 0) salaries.push({ monthlyCents, startDate: link?.startDate ?? null });
    if (link?.commissionPercent == null) continue;
    if (member.role === "receptionist") grossCommissionPercent += link.commissionPercent;
    else if (member.userId) commissionRates[member.userId.toString()] = link.commissionPercent;
  }
  return { commissionRates, grossCommissionPercent, salaries };
}

// Valores mensais (sem arredondar) dos dias do intervalo até `last`, cada um a partir da data de
// início: cada dia vale 1/n do mês de n dias.
function monthlyForDays({ from, to }: DayRange, salaries: StaffSalary[], last = to) {
  let salary = 0;
  for (let date = from; date <= to && date <= last; date = addDays(date, 1)) {
    const [year, month] = parseDay(date)!;
    const daysInMonth = Number(utcDay(year, month + 1, 0).slice(8));
    for (const { monthlyCents, startDate } of salaries) {
      if (!startDate || startDate <= date) salary += monthlyCents / daysInMonth;
    }
  }
  return salary;
}

function withStaffCosts(amounts: CashFlowAmounts, grossCommissionPercent: number, salary: number): StaffCashFlowAmounts {
  const extraCommission = Math.round((amounts.grossCents * grossCommissionPercent) / 100);
  const salaryCents = Math.round(salary);
  return {
    ...amounts,
    commissionCents: amounts.commissionCents + extraCommission,
    salaryCents,
    netCents: amounts.netCents - extraCommission - salaryCents,
  };
}

// Real: salário só até hoje. Previsto: o intervalo inteiro. Arredonda por intervalo e o
// total soma os intervalos arredondados.
export function applyStaffCosts(
  summary: CashFlowSummary,
  { grossCommissionPercent, salaries, today }: StaffCosts,
): StaffCashFlowSummary {
  const buckets = summary.buckets.map((bucket) => ({
    ...bucket,
    real: withStaffCosts(bucket.real, grossCommissionPercent, monthlyForDays(bucket, salaries, today)),
    forecast: withStaffCosts(bucket.forecast, grossCommissionPercent, monthlyForDays(bucket, salaries)),
  }));
  const zero = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, netCents: 0 };
  const add = (a: StaffCashFlowAmounts, b: StaffCashFlowAmounts) => ({
    ...addAmounts(a, b),
    salaryCents: a.salaryCents + b.salaryCents,
  });
  return {
    buckets,
    total: {
      real: buckets.reduce((sum, row) => add(sum, row.real), zero),
      forecast: buckets.reduce((sum, row) => add(sum, row.forecast), zero),
    },
  };
}

export type CostRow<T> = ({ kind: "partner_share" | "commission" | "salary" } | { kind: "group"; group: T }) & {
  cents: number;
  // Fração do total, de 0 a 1.
  share: number;
};

// Para onde foi o dinheiro: repasse, equipe e cada grupo de despesa, do maior para o menor.
// O sort é estável, então no empate fica a ordem de montagem (repasse, equipe, grupos).
export function summarizeCosts<T extends { paidCents: number }>(
  { partnerShareCents, commissionCents, salaryCents }: Pick<StaffCashFlowAmounts, "partnerShareCents" | "commissionCents" | "salaryCents">,
  groups: T[],
): { totalCents: number; rows: CostRow<T>[] } {
  const items = [
    { kind: "partner_share" as const, cents: partnerShareCents },
    { kind: "commission" as const, cents: commissionCents },
    { kind: "salary" as const, cents: salaryCents },
    ...groups.map((group) => ({ kind: "group" as const, group, cents: group.paidCents })),
  ].filter((item) => item.cents > 0);
  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  return {
    totalCents,
    rows: items.map((item) => ({ ...item, share: item.cents / totalCents })).sort((a, b) => b.cents - a.cents),
  };
}

// Um intervalo da curva S: planejado (orçamento dos grupos) e gasto (real), no intervalo e
// acumulados. Depois de hoje ainda não há gasto, então fica null para a linha parar no atual.
export type CostCurvePoint = DayRange & {
  plannedCents: number;
  spentCents: number | null;
  plannedCumulativeCents: number;
  spentCumulativeCents: number | null;
};

function costsOf({ partnerShareCents, commissionCents, salaryCents, expenseCents }: ExpenseCashFlowAmounts) {
  return partnerShareCents + commissionCents + salaryCents + expenseCents;
}

// Recebe os mesmos intervalos de cada unidade e soma as unidades intervalo a intervalo. O
// orçamento mensal é rateado pelos dias, como o salário; arredonda por intervalo.
export function costCurve(
  units: { buckets: ExpenseCashFlowBucket[]; monthlyBudgetCents: number }[],
  today: string,
): CostCurvePoint[] {
  const monthlyBudgetCents = units.reduce((sum, unit) => sum + unit.monthlyBudgetCents, 0);
  const budget = [{ monthlyCents: monthlyBudgetCents, startDate: null }];
  let planned = 0;
  let spent = 0;
  return (units[0]?.buckets ?? []).map(({ from, to }, index) => {
    const plannedCents = Math.round(monthlyForDays({ from, to }, budget));
    const spentCents = units.reduce((sum, unit) => sum + costsOf(unit.buckets[index].real), 0);
    planned += plannedCents;
    spent += spentCents;
    const started = from <= today;
    return {
      from,
      to,
      plannedCents,
      spentCents: started ? spentCents : null,
      plannedCumulativeCents: planned,
      spentCumulativeCents: started ? spent : null,
    };
  });
}
