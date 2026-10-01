// Sem dependências de servidor: também é importado pela tela de custos.
// Consumo dos modelos de IA: preço por modelo, registro de cada chamada e o resumo da tela de custos.
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";

// US$ por milhão de tokens, a mesma tabela do s4ilor.
export const AI_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 2, output: 16 },
  "gpt-5.4-mini": { input: 0.5, output: 4 },
  "gpt-5.4-nano": { input: 0.1, output: 0.8 },
  "gpt-5.2": { input: 1.75, output: 14 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

export const AI_USAGE_ACTIONS = ["agenia_global", "agenia_ura", "agenia_conversation", "agenia_suggest"] as const;
export type AiUsageAction = (typeof AI_USAGE_ACTIONS)[number];

export const AI_USAGE_ACTION_LABELS: Record<AiUsageAction, string> = {
  agenia_global: "AgenIA",
  agenia_ura: "AgenIA na URA",
  agenia_conversation: "AgenIA na conversa",
  agenia_suggest: "Sugestão de resposta",
};

export const normalizeModelId = (raw: string) => raw.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");

// Tokens em cache já estão em inputTokens e são cobrados pelo preço cheio (a tabela não tem preço de cache).
export function usageCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }) {
  const price = AI_MODEL_PRICING[model];
  if (!price) return null;
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1e9) / 1e9;
}

// Formato do consumo que o AI SDK devolve (totalUsage).
type SdkUsage = {
  inputTokens?: number;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number };
  outputTokens?: number;
  outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
  totalTokens?: number;
};

export function buildUsageRecord({ rawModel, usage }: { rawModel: string; usage: SdkUsage }) {
  const model = normalizeModelId(rawModel);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    model,
    rawModel,
    inputTokens,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
    costUsd: usageCostUsd(model, { inputTokens, outputTokens }),
  };
}

export const COST_PERIODS = ["thismonth", "yesterday", "last7days", "last30days", "last90days", "lastmonth"] as const;
export type CostPeriod = (typeof COST_PERIODS)[number];
export const COST_GRANULARITIES = ["daily", "weekly", "monthly"] as const;
export type CostGranularity = (typeof COST_GRANULARITIES)[number];
export const COST_GROUP_BYS = ["action", "model", "user"] as const;
export type CostGroupBy = (typeof COST_GROUP_BYS)[number];

export type DayRange = { startDate: string; endDate: string };

const DAY_MS = 24 * 60 * 60 * 1000;

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) => toDay(new Date(dayDate(day).getTime() + days * DAY_MS));
const brtToday = (now: Date) => toDay(new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000));

export function costRange(period: CostPeriod, now: Date): DayRange {
  const today = brtToday(now);
  const yesterday = addDays(today, -1);
  const lastDays = (count: number) => ({ startDate: addDays(today, -count), endDate: yesterday });
  switch (period) {
    case "thismonth":
      return { startDate: `${today.slice(0, 8)}01`, endDate: today };
    case "yesterday":
      return { startDate: yesterday, endDate: yesterday };
    case "last7days":
      return lastDays(7);
    case "last30days":
      return lastDays(30);
    case "last90days":
      return lastDays(90);
    case "lastmonth": {
      const end = addDays(`${today.slice(0, 8)}01`, -1);
      return { startDate: `${end.slice(0, 8)}01`, endDate: end };
    }
  }
}

export function previousCostRange({ startDate, endDate }: DayRange): DayRange {
  const days = Math.round((dayDate(endDate).getTime() - dayDate(startDate).getTime()) / DAY_MS) + 1;
  const end = addDays(startDate, -1);
  return { startDate: addDays(end, -(days - 1)), endDate: end };
}

export type CostQuery = DayRange & {
  period: CostPeriod | null;
  granularity: CostGranularity;
  groupBy: CostGroupBy;
  action: AiUsageAction[];
  model: string[];
  user: string[];
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const oneOf = <T extends string>(value: string | undefined, options: readonly T[], fallback: T) =>
  options.includes(value as T) ? (value as T) : fallback;
const csv = (value: string | undefined) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);

// Filtros da tela de custos vindos da URL; o que for inválido volta ao padrão.
export function parseCostQuery(params: SearchParams, now: Date): CostQuery {
  const start = first(params.startDate);
  const end = first(params.endDate);
  const custom = start && end && parseDay(start) && parseDay(end) && start <= end ? { startDate: start, endDate: end } : null;
  const period = custom ? null : oneOf(first(params.period), COST_PERIODS, "thismonth");
  const page = Number(first(params.page));

  return {
    period,
    ...(custom ?? costRange(period!, now)),
    granularity: oneOf(first(params.granularity), COST_GRANULARITIES, "daily"),
    groupBy: oneOf(first(params.groupBy), COST_GROUP_BYS, "action"),
    action: csv(first(params.action)).filter((a): a is AiUsageAction => AI_USAGE_ACTIONS.includes(a as AiUsageAction)),
    model: csv(first(params.model)),
    user: csv(first(params.user)).filter((id) => /^[0-9a-f]{24}$/i.test(id)),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

// Semana ISO: começa na segunda e é do ano da quinta-feira dela.
function isoWeek(day: string) {
  const date = dayDate(day);
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function bucketOf(day: string, granularity: CostGranularity) {
  if (granularity === "monthly") return day.slice(0, 7);
  if (granularity === "weekly") return isoWeek(day);
  return day;
}

export function costBuckets(range: DayRange, granularity: CostGranularity) {
  const buckets: string[] = [];
  for (let day = range.startDate; day <= range.endDate; day = addDays(day, 1)) {
    const bucket = bucketOf(day, granularity);
    if (buckets.at(-1) !== bucket) buckets.push(bucket);
  }
  return buckets;
}

export const TOP_SERIES = 6;
export const AI_COST_PAGE_SIZE = 20;
export const OTHERS_KEY = "others";
export const OTHERS_LABEL = "Outros";

// Consumo agregado por grupo (ação, modelo ou usuário) e dia de Brasília.
export type CostRow = { key: string; day: string; costUsd: number; requests: number; tokens: number; unpriced: number };

export function summarizeCosts({
  rows,
  range,
  granularity,
  labelOf,
}: {
  rows: CostRow[];
  range: DayRange;
  granularity: CostGranularity;
  labelOf: (key: string) => string;
}) {
  const buckets = costBuckets(range, granularity);
  const totals = { costUsd: 0, requests: 0, tokens: 0, unpriced: 0 };
  const byKey = new Map<string, { costUsd: number; requests: number; tokens: number; byBucket: Map<string, number> }>();

  for (const row of rows) {
    totals.costUsd += row.costUsd;
    totals.requests += row.requests;
    totals.tokens += row.tokens;
    totals.unpriced += row.unpriced;
    const group = byKey.get(row.key) ?? { costUsd: 0, requests: 0, tokens: 0, byBucket: new Map() };
    group.costUsd += row.costUsd;
    group.requests += row.requests;
    group.tokens += row.tokens;
    const bucket = bucketOf(row.day, granularity);
    group.byBucket.set(bucket, (group.byBucket.get(bucket) ?? 0) + row.costUsd);
    byKey.set(row.key, group);
  }

  const groups = [...byKey.entries()]
    .map(([key, group]) => ({
      key,
      label: labelOf(key),
      costUsd: group.costUsd,
      requests: group.requests,
      tokens: group.tokens,
      share: totals.costUsd ? (group.costUsd / totals.costUsd) * 100 : 0,
      series: buckets.map((date) => ({ date, value: group.byBucket.get(date) ?? 0 })),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);

  const top = groups.slice(0, TOP_SERIES);
  const rest = groups.slice(TOP_SERIES);
  const chartSeries = top.map((group, i) => ({ id: `s${i}`, key: group.key, label: group.label }));
  if (rest.length) chartSeries.push({ id: OTHERS_KEY, key: OTHERS_KEY, label: OTHERS_LABEL });

  const series = buckets.map((date, b) => {
    const point: Record<string, string | number> = { date };
    top.forEach((group, i) => (point[`s${i}`] = group.series[b].value));
    if (rest.length) point[OTHERS_KEY] = rest.reduce((sum, group) => sum + group.series[b].value, 0);
    return point;
  });

  return { totals, groups, chartSeries, series };
}

export function costDelta(current: number, previous: number) {
  if (!previous) return null;
  const percent = ((current - previous) / previous) * 100;
  return { percent, label: `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`, tone: percent > 0 ? ("up" as const) : ("down" as const) };
}
