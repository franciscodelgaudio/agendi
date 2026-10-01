import { describe, it, expect } from "vitest";
import {
  AI_MODEL_PRICING,
  AI_USAGE_ACTIONS,
  AI_USAGE_ACTION_LABELS,
  bucketOf,
  buildUsageRecord,
  costBuckets,
  costDelta,
  costRange,
  normalizeModelId,
  parseCostQuery,
  previousCostRange,
  summarizeCosts,
  TOP_SERIES,
  usageCostUsd,
} from "@/service/workspace/[workspaceId]/ai-costs/ai-usage";

// 28/09/2026 10:00 em Brasília (13:00 UTC).
const NOW = new Date("2026-09-28T13:00:00Z");

describe("preços", () => {
  it("tem os modelos da OpenAI usados pela AgenIA", () => {
    expect(AI_MODEL_PRICING["gpt-5.4-mini"]).toEqual({ input: 0.5, output: 4 });
    expect(AI_MODEL_PRICING["gpt-5.4"]).toEqual({ input: 2, output: 16 });
  });

  it("normalizeModelId tira a data de versão que a API devolve", () => {
    expect(normalizeModelId("gpt-5.4-mini-2026-03-17")).toBe("gpt-5.4-mini");
    expect(normalizeModelId("GPT-5.4")).toBe("gpt-5.4");
    expect(normalizeModelId("gpt-5.4-nano")).toBe("gpt-5.4-nano");
  });

  it("usageCostUsd cobra entrada e saída pelo preço por milhão de tokens", () => {
    expect(usageCostUsd("gpt-5.4-mini", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(4.5);
    expect(usageCostUsd("gpt-5.4-mini", { inputTokens: 2000, outputTokens: 500 })).toBe(0.003);
  });

  it("modelo sem preço conhecido fica sem custo (null)", () => {
    expect(usageCostUsd("modelo-x", { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });
});

describe("ações", () => {
  it("toda ação tem rótulo", () => {
    expect(AI_USAGE_ACTIONS).toEqual(["agenia_global", "agenia_ura", "agenia_conversation", "agenia_suggest"]);
    for (const action of AI_USAGE_ACTIONS) expect(AI_USAGE_ACTION_LABELS[action].length).toBeGreaterThan(0);
  });
});

describe("buildUsageRecord", () => {
  it("converte o consumo do AI SDK nos campos do registro, com o custo", () => {
    expect(
      buildUsageRecord({
        rawModel: "gpt-5.4-mini-2026-03-17",
        usage: {
          inputTokens: 2000,
          inputTokenDetails: { noCacheTokens: 1500, cacheReadTokens: 500 },
          outputTokens: 500,
          outputTokenDetails: { textTokens: 300, reasoningTokens: 200 },
          totalTokens: 2500,
        },
      }),
    ).toEqual({
      model: "gpt-5.4-mini",
      rawModel: "gpt-5.4-mini-2026-03-17",
      inputTokens: 2000,
      cachedInputTokens: 500,
      outputTokens: 500,
      reasoningTokens: 200,
      totalTokens: 2500,
      costUsd: 0.003,
    });
  });

  it("campos ausentes viram zero", () => {
    expect(buildUsageRecord({ rawModel: "gpt-5.4", usage: {} })).toEqual({
      model: "gpt-5.4",
      rawModel: "gpt-5.4",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  });
});

describe("parseCostQuery", () => {
  it("sem parâmetros: este mês, por dia, agrupado por ação, página 1", () => {
    expect(parseCostQuery({}, NOW)).toEqual({
      period: "thismonth",
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      granularity: "daily",
      groupBy: "action",
      action: [],
      model: [],
      user: [],
      page: 1,
    });
  });

  it("lê período, granularidade, agrupamento, filtros separados por vírgula e página", () => {
    expect(
      parseCostQuery(
        { period: "last7days", granularity: "weekly", groupBy: "model", model: "gpt-5.4,gpt-5.4-mini", action: "agenia_ura", page: "3" },
        NOW,
      ),
    ).toMatchObject({
      period: "last7days",
      startDate: "2026-09-21",
      endDate: "2026-09-27",
      granularity: "weekly",
      groupBy: "model",
      model: ["gpt-5.4", "gpt-5.4-mini"],
      action: ["agenia_ura"],
      page: 3,
    });
  });

  it("intervalo personalizado tira o período", () => {
    expect(parseCostQuery({ startDate: "2026-08-10", endDate: "2026-08-20", period: "last7days" }, NOW)).toMatchObject({
      period: null,
      startDate: "2026-08-10",
      endDate: "2026-08-20",
    });
  });

  it("valores inválidos voltam ao padrão", () => {
    expect(
      parseCostQuery({ period: "sempre", granularity: "hora", groupBy: "cor", page: "-2", action: "agenia_x,agenia_ura" }, NOW),
    ).toMatchObject({ period: "thismonth", granularity: "daily", groupBy: "action", page: 1, action: ["agenia_ura"] });
    expect(parseCostQuery({ startDate: "2026-08-20", endDate: "2026-08-10" }, NOW)).toMatchObject({
      period: "thismonth",
      startDate: "2026-09-01",
    });
    expect(parseCostQuery({ startDate: "20/08/2026", endDate: "2026-08-30" }, NOW)).toMatchObject({ period: "thismonth" });
  });

  it("parâmetro repetido usa o primeiro", () => {
    expect(parseCostQuery({ period: ["yesterday", "last7days"] }, NOW)).toMatchObject({ period: "yesterday" });
  });
});

describe("costRange", () => {
  it("calcula cada período no dia de Brasília", () => {
    expect(costRange("thismonth", NOW)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-28" });
    expect(costRange("yesterday", NOW)).toEqual({ startDate: "2026-09-27", endDate: "2026-09-27" });
    expect(costRange("last7days", NOW)).toEqual({ startDate: "2026-09-21", endDate: "2026-09-27" });
    expect(costRange("last30days", NOW)).toEqual({ startDate: "2026-08-29", endDate: "2026-09-27" });
    expect(costRange("last90days", NOW)).toEqual({ startDate: "2026-06-30", endDate: "2026-09-27" });
    expect(costRange("lastmonth", NOW)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("às 22h de Brasília (já dia seguinte em UTC) ainda é o mesmo dia", () => {
    expect(costRange("thismonth", new Date("2026-10-01T01:00:00Z"))).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  });
});

describe("previousCostRange", () => {
  it("é o intervalo de mesmo tamanho logo antes", () => {
    expect(previousCostRange({ startDate: "2026-09-21", endDate: "2026-09-27" })).toEqual({
      startDate: "2026-09-14",
      endDate: "2026-09-20",
    });
    expect(previousCostRange({ startDate: "2026-03-01", endDate: "2026-03-01" })).toEqual({
      startDate: "2026-02-28",
      endDate: "2026-02-28",
    });
  });
});

describe("buckets", () => {
  it("bucketOf agrupa o dia por dia, semana ISO ou mês", () => {
    expect(bucketOf("2026-09-28", "daily")).toBe("2026-09-28");
    expect(bucketOf("2026-09-28", "weekly")).toBe("2026-W40");
    expect(bucketOf("2026-09-27", "weekly")).toBe("2026-W39");
    expect(bucketOf("2027-01-01", "weekly")).toBe("2026-W53");
    expect(bucketOf("2026-09-28", "monthly")).toBe("2026-09");
  });

  it("costBuckets lista todos os buckets do intervalo, sem buracos", () => {
    expect(costBuckets({ startDate: "2026-09-26", endDate: "2026-09-29" }, "daily")).toEqual([
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
    ]);
    expect(costBuckets({ startDate: "2026-09-20", endDate: "2026-10-05" }, "weekly")).toEqual([
      "2026-W38",
      "2026-W39",
      "2026-W40",
      "2026-W41",
    ]);
    expect(costBuckets({ startDate: "2026-08-15", endDate: "2026-10-02" }, "monthly")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});

describe("summarizeCosts", () => {
  const range = { startDate: "2026-09-26", endDate: "2026-09-28" };
  const label = (key: string) => `rótulo ${key}`;

  it("soma totais, ordena grupos por custo e calcula a participação", () => {
    const summary = summarizeCosts({
      rows: [
        { key: "a", day: "2026-09-26", costUsd: 1, requests: 2, tokens: 100, unpriced: 0 },
        { key: "b", day: "2026-09-26", costUsd: 3, requests: 1, tokens: 300, unpriced: 1 },
        { key: "a", day: "2026-09-28", costUsd: 0, requests: 1, tokens: 10, unpriced: 0 },
      ],
      range,
      granularity: "daily",
      labelOf: label,
    });
    expect(summary.totals).toEqual({ costUsd: 4, requests: 4, tokens: 410, unpriced: 1 });
    expect(summary.groups.map((g) => [g.key, g.label, g.costUsd, g.requests, g.tokens, g.share])).toEqual([
      ["b", "rótulo b", 3, 1, 300, 75],
      ["a", "rótulo a", 1, 3, 110, 25],
    ]);
  });

  it("série do gráfico tem todos os buckets, com zero onde não houve gasto", () => {
    const summary = summarizeCosts({
      rows: [
        { key: "a", day: "2026-09-26", costUsd: 1, requests: 1, tokens: 1, unpriced: 0 },
        { key: "b", day: "2026-09-28", costUsd: 2, requests: 1, tokens: 1, unpriced: 0 },
      ],
      range,
      granularity: "daily",
      labelOf: label,
    });
    expect(summary.chartSeries).toEqual([
      { id: "s0", key: "b", label: "rótulo b" },
      { id: "s1", key: "a", label: "rótulo a" },
    ]);
    expect(summary.series).toEqual([
      { date: "2026-09-26", s0: 0, s1: 1 },
      { date: "2026-09-27", s0: 0, s1: 0 },
      { date: "2026-09-28", s0: 2, s1: 0 },
    ]);
    expect(summary.groups[1].series).toEqual([
      { date: "2026-09-26", value: 1 },
      { date: "2026-09-27", value: 0 },
      { date: "2026-09-28", value: 0 },
    ]);
  });

  it("junta os dias do mesmo bucket", () => {
    const summary = summarizeCosts({
      rows: [
        { key: "a", day: "2026-09-01", costUsd: 1, requests: 1, tokens: 1, unpriced: 0 },
        { key: "a", day: "2026-09-20", costUsd: 2, requests: 1, tokens: 1, unpriced: 0 },
      ],
      range: { startDate: "2026-09-01", endDate: "2026-09-28" },
      granularity: "monthly",
      labelOf: label,
    });
    expect(summary.series).toEqual([{ date: "2026-09", s0: 3 }]);
  });

  it(`depois dos ${TOP_SERIES} maiores, o resto vira Outros no gráfico`, () => {
    const rows = Array.from({ length: TOP_SERIES + 2 }, (_, i) => ({
      key: `k${i}`,
      day: "2026-09-26",
      costUsd: 100 - i,
      requests: 1,
      tokens: 1,
      unpriced: 0,
    }));
    const summary = summarizeCosts({ rows, range: { startDate: "2026-09-26", endDate: "2026-09-26" }, granularity: "daily", labelOf: label });
    expect(summary.chartSeries).toHaveLength(TOP_SERIES + 1);
    expect(summary.chartSeries.at(-1)).toEqual({ id: "others", key: "others", label: "Outros" });
    expect(summary.series[0].others).toBe(100 - TOP_SERIES + (100 - TOP_SERIES - 1));
    expect(summary.groups).toHaveLength(TOP_SERIES + 2);
  });

  it("sem consumo, tudo zerado e sem grupos", () => {
    const summary = summarizeCosts({ rows: [], range, granularity: "daily", labelOf: label });
    expect(summary.totals).toEqual({ costUsd: 0, requests: 0, tokens: 0, unpriced: 0 });
    expect(summary.groups).toEqual([]);
    expect(summary.chartSeries).toEqual([]);
    expect(summary.series).toHaveLength(3);
  });
});

describe("costDelta", () => {
  it("variação percentual contra o período anterior", () => {
    expect(costDelta(15, 10)).toEqual({ percent: 50, label: "+50%", tone: "up" });
    expect(costDelta(5, 10)).toEqual({ percent: -50, label: "-50%", tone: "down" });
  });

  it("sem gasto anterior não há variação", () => {
    expect(costDelta(5, 0)).toBeNull();
  });
});
