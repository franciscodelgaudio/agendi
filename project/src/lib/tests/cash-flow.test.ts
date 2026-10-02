import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowBuckets,
  cashFlowFetchRange,
  costCurve,
  costMonthDate,
  dailyAppointmentTotalsPipeline,
  dailyBookingForecastPipeline,
  parseCashFlowQuery,
  serviceAppointmentTotalsPipeline,
  serviceBookingForecastPipeline,
  shiftCashFlowDate,
  summarizeCashFlow,
  summarizeCosts,
  summarizeServices,
  summarizeTherapists,
  teamPayRates,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";

// 24/09/2026 (quinta-feira) às 23:30 em Brasília (já é dia 25 em UTC).
const NOW = new Date("2026-09-25T02:30:00.000Z");

const day = (date: string) => ({ from: date, to: date });

describe("parseCashFlowQuery", () => {
  it("sem parâmetros, mostra o mês de hoje em Brasília", () => {
    expect(parseCashFlowQuery({}, NOW)).toEqual({ view: "month", date: "2026-09-24" });
  });

  it.each(["week", "month", "year"])("aceita a visão %s", (view) => {
    expect(parseCashFlowQuery({ view, date: "2026-03-10" }, NOW)).toEqual({ view, date: "2026-03-10" });
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseCashFlowQuery({ view: ["year", "week"], date: ["2026-01-05", "2026-02-05"] }, NOW)).toEqual({
      view: "year",
      date: "2026-01-05",
    });
  });

  it.each(["day", "semana", "", "$where"])("volta para o mês quando a visão é %j", (view) => {
    expect(parseCashFlowQuery({ view }, NOW).view).toBe("month");
  });

  it.each(["24/09/2026", "2026-02-30", "hoje"])("volta para hoje quando a data é %s", (date) => {
    expect(parseCashFlowQuery({ date }, NOW).date).toBe("2026-09-24");
  });
});

describe("shiftCashFlowDate", () => {
  it.each([
    ["week", "2026-09-24", 1, "2026-10-01"],
    ["week", "2026-09-24", -1, "2026-09-17"],
    ["week", "2026-12-29", 1, "2027-01-05"],
  ] as const)("visão %s: %s %+d = %s (7 dias por passo)", (view, date, steps, expected) => {
    expect(shiftCashFlowDate({ view, date }, steps)).toBe(expected);
  });

  it.each([
    ["month", "2026-09-24", 1, "2026-10-01"],
    ["month", "2026-01-31", 1, "2026-02-01"],
    ["month", "2026-01-15", -1, "2025-12-01"],
    ["year", "2026-09-24", 1, "2027-01-01"],
    ["year", "2026-09-24", -1, "2025-01-01"],
  ] as const)("visão %s: %s %+d = %s (primeiro dia do período)", (view, date, steps, expected) => {
    expect(shiftCashFlowDate({ view, date }, steps)).toBe(expected);
  });
});

describe("costMonthDate", () => {
  const YEAR = { from: "2026-01-01", to: "2026-12-31" };

  it("usa o mês escolhido (AAAA-MM) dentro do ano exibido, no primeiro dia", () => {
    expect(costMonthDate("2026-03", YEAR, "2026-09-24")).toBe("2026-03-01");
    expect(costMonthDate("2026-12", YEAR, "2026-09-24")).toBe("2026-12-01");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(costMonthDate(["2026-05", "2026-06"], YEAR, "2026-09-24")).toBe("2026-05-01");
  });

  it("sem mês escolhido, mostra o mês de hoje no ano atual", () => {
    expect(costMonthDate(undefined, YEAR, "2026-09-24")).toBe("2026-09-01");
  });

  it("sem mês escolhido, ano passado mostra dezembro e ano futuro, janeiro", () => {
    expect(costMonthDate(undefined, YEAR, "2027-02-10")).toBe("2026-12-01");
    expect(costMonthDate(undefined, YEAR, "2025-11-10")).toBe("2026-01-01");
  });

  it.each(["2025-12", "2027-01"])("ignora o mês %s fora do ano exibido", (month) => {
    expect(costMonthDate(month, YEAR, "2026-09-24")).toBe("2026-09-01");
  });

  it.each(["2026-13", "2026-00", "2026-3", "2026-03-10", "março", ""])("ignora o mês inválido %j", (month) => {
    expect(costMonthDate(month, YEAR, "2026-09-24")).toBe("2026-09-01");
  });
});

describe("cashFlowBuckets", () => {
  it("semana: um intervalo por dia, de segunda a domingo", () => {
    expect(cashFlowBuckets({ view: "week", date: "2026-09-24" })).toEqual([
      day("2026-09-21"),
      day("2026-09-22"),
      day("2026-09-23"),
      day("2026-09-24"),
      day("2026-09-25"),
      day("2026-09-26"),
      day("2026-09-27"),
    ]);
  });

  it("semana que atravessa a virada do ano", () => {
    const buckets = cashFlowBuckets({ view: "week", date: "2027-01-01" });

    expect(buckets[0]).toEqual(day("2026-12-28"));
    expect(buckets[6]).toEqual(day("2027-01-03"));
  });

  it("mês: semanas de segunda a domingo, cortadas no início e no fim do mês", () => {
    expect(cashFlowBuckets({ view: "month", date: "2026-09-24" })).toEqual([
      { from: "2026-09-01", to: "2026-09-06" },
      { from: "2026-09-07", to: "2026-09-13" },
      { from: "2026-09-14", to: "2026-09-20" },
      { from: "2026-09-21", to: "2026-09-27" },
      { from: "2026-09-28", to: "2026-09-30" },
    ]);
  });

  it("mês que começa num domingo tem a primeira semana de um dia só", () => {
    expect(cashFlowBuckets({ view: "month", date: "2026-02-10" })).toEqual([
      { from: "2026-02-01", to: "2026-02-01" },
      { from: "2026-02-02", to: "2026-02-08" },
      { from: "2026-02-09", to: "2026-02-15" },
      { from: "2026-02-16", to: "2026-02-22" },
      { from: "2026-02-23", to: "2026-02-28" },
    ]);
  });

  it("ano: um intervalo por mês, respeitando anos bissextos", () => {
    const buckets = cashFlowBuckets({ view: "year", date: "2028-06-15" });

    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ from: "2028-01-01", to: "2028-01-31" });
    expect(buckets[1]).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(buckets[11]).toEqual({ from: "2028-12-01", to: "2028-12-31" });
  });
});

describe("cashFlowFetchRange", () => {
  const monthBuckets = cashFlowBuckets({ view: "month", date: "2026-09-24" });

  it("sem repasse, cobre só os intervalos exibidos", () => {
    expect(cashFlowFetchRange(monthBuckets, null)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("repasse semanal: estende até as semanas completas das pontas", () => {
    expect(cashFlowFetchRange(monthBuckets, "weekly")).toEqual({ from: "2026-08-31", to: "2026-10-04" });
  });

  it("repasse quinzenal: quinzenas são 1–15 e 16–fim do mês", () => {
    const buckets = [{ from: "2026-09-14", to: "2026-09-20" }];

    expect(cashFlowFetchRange(buckets, "biweekly")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("repasse mensal numa semana que atravessa meses: cobre os dois meses inteiros", () => {
    const buckets = cashFlowBuckets({ view: "week", date: "2026-10-01" });

    expect(cashFlowFetchRange(buckets, "monthly")).toEqual({ from: "2026-09-01", to: "2026-10-31" });
  });

  it("repasse mensal na visão anual não estende nada", () => {
    const buckets = cashFlowBuckets({ view: "year", date: "2026-09-24" });

    expect(cashFlowFetchRange(buckets, "monthly")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

// O dia em Brasília vai de 03:00 UTC até 03:00 UTC do dia seguinte.
const dayKey = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: "-03:00" } });
const PROJECT = {
  $project: {
    _id: 0,
    date: "$_id.date",
    therapistId: { $toString: "$_id.therapistId" },
    therapistName: 1,
    count: 1,
    cents: 1,
  },
};
const RANGE = { from: "2026-09-21", to: "2026-09-27" };

describe("dailyAppointmentTotalsPipeline", () => {
  it("filtra o intervalo em Brasília e soma os serviços por dia e profissional, com o nome mais recente", () => {
    expect(dailyAppointmentTotalsPipeline(RANGE)).toEqual([
      {
        $match: {
          performedAt: { $gte: new Date("2026-09-21T03:00:00.000Z"), $lt: new Date("2026-09-28T03:00:00.000Z") },
        },
      },
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
      PROJECT,
    ]);
  });
});

describe("dailyBookingForecastPipeline", () => {
  const stagesAfterMatch = [
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
    // Agendamento sem serviço (ou com serviço excluído) conta como zero.
    {
      $group: {
        _id: { date: dayKey("$startsAt"), therapistId: "$therapistId" },
        therapistName: { $last: "$therapistName" },
        count: { $sum: 1 },
        cents: { $sum: { $ifNull: [{ $first: "$services.priceCents" }, 0] } },
      },
    },
    PROJECT,
  ];

  it("só conta agendamentos a partir de agora, com o preço atual do serviço, por dia e profissional", () => {
    expect(dailyBookingForecastPipeline(RANGE, NOW)).toEqual([
      { $match: { startsAt: { $gte: NOW, $lt: new Date("2026-09-28T03:00:00.000Z") } } },
      ...stagesAfterMatch,
    ]);
  });

  it("intervalo todo no futuro começa no início do intervalo", () => {
    const [match] = dailyBookingForecastPipeline(RANGE, new Date("2026-01-01T12:00:00.000Z"));

    expect(match).toEqual({
      $match: {
        startsAt: { $gte: new Date("2026-09-21T03:00:00.000Z"), $lt: new Date("2026-09-28T03:00:00.000Z") },
      },
    });
  });
});

// Total de um dia de um profissional, como vem das pipelines diárias.
const total = (date: string, cents: number, therapistId = "ana", count = 1) => ({
  date,
  therapistId,
  therapistName: therapistId === "ana" ? "Ana" : "Bia",
  count,
  cents,
});
const zero = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, netCents: 0 };

describe("summarizeCashFlow", () => {
  it("sem movimento, tudo zerado", () => {
    expect(summarizeCashFlow([day("2026-09-21")], [], [], null, {})).toEqual({
      buckets: [{ ...day("2026-09-21"), real: zero, forecast: zero }],
      total: { real: zero, forecast: zero },
    });
  });

  it("espaço próprio: real soma atendimentos, previsto soma atendimentos e agendamentos, sem repasse", () => {
    const result = summarizeCashFlow(
      [{ from: "2026-09-21", to: "2026-09-22" }, day("2026-09-23")],
      [total("2026-09-21", 10_000), total("2026-09-22", 5_000)],
      [total("2026-09-23", 7_000)],
      null,
      {},
    );

    expect(result).toEqual({
      buckets: [
        {
          from: "2026-09-21",
          to: "2026-09-22",
          real: { grossCents: 15_000, partnerShareCents: 0, commissionCents: 0, netCents: 15_000 },
          forecast: { grossCents: 15_000, partnerShareCents: 0, commissionCents: 0, netCents: 15_000 },
        },
        {
          ...day("2026-09-23"),
          real: zero,
          forecast: { grossCents: 7_000, partnerShareCents: 0, commissionCents: 0, netCents: 7_000 },
        },
      ],
      total: {
        real: { grossCents: 15_000, partnerShareCents: 0, commissionCents: 0, netCents: 15_000 },
        forecast: { grossCents: 22_000, partnerShareCents: 0, commissionCents: 0, netCents: 22_000 },
      },
    });
  });

  it("profissionais do mesmo dia somam no bruto", () => {
    const result = summarizeCashFlow(
      [day("2026-09-21")],
      [total("2026-09-21", 10_000, "ana"), total("2026-09-21", 6_000, "bia")],
      [],
      null,
      {},
    );

    expect(result.total.real).toEqual({ grossCents: 16_000, partnerShareCents: 0, commissionCents: 0, netCents: 16_000 });
  });

  it("dias buscados fora dos intervalos só entram no cálculo do repasse, não nos totais", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };

    const result = summarizeCashFlow(
      [day("2026-09-21"), day("2026-09-22")],
      [total("2026-09-20", 99_000), total("2026-09-21", 10_000), total("2026-09-22", 30_000)],
      [],
      share,
      {},
    );

    expect(result.buckets.map((bucket) => bucket.real)).toEqual([
      { grossCents: 10_000, partnerShareCents: 2_000, commissionCents: 0, netCents: 8_000 },
      { grossCents: 30_000, partnerShareCents: 6_000, commissionCents: 0, netCents: 24_000 },
    ]);
    expect(result.total.real).toEqual({ grossCents: 40_000, partnerShareCents: 8_000, commissionCents: 0, netCents: 32_000 });
  });

  it("repasse mensal por faixa numa semana: calcula sobre o mês e rateia pelo faturamento de cada dia", () => {
    // Até R$ 1.000 paga 10% sobre o total; acima disso, 20% sobre o total.
    const share: RevenueShare = {
      period: "monthly",
      tiers: [
        { upToCents: 100_000, percent: 10 },
        { upToCents: null, percent: 20 },
      ],
    };

    const result = summarizeCashFlow(
      [day("2026-09-21"), day("2026-09-22"), day("2026-09-25")],
      [total("2026-09-02", 80_000), total("2026-09-21", 20_000), total("2026-09-22", 20_000)],
      [total("2026-09-25", 60_000)],
      share,
      {},
    );

    // Real: mês = R$ 1.200 -> 20% = R$ 240, rateado 20.000/120.000 para cada dia.
    // Previsto: mês = R$ 1.800 -> 20% = R$ 360, rateado 20.000/180.000 e 60.000/180.000.
    expect(result.buckets).toEqual([
      {
        ...day("2026-09-21"),
        real: { grossCents: 20_000, partnerShareCents: 4_000, commissionCents: 0, netCents: 16_000 },
        forecast: { grossCents: 20_000, partnerShareCents: 4_000, commissionCents: 0, netCents: 16_000 },
      },
      {
        ...day("2026-09-22"),
        real: { grossCents: 20_000, partnerShareCents: 4_000, commissionCents: 0, netCents: 16_000 },
        forecast: { grossCents: 20_000, partnerShareCents: 4_000, commissionCents: 0, netCents: 16_000 },
      },
      {
        ...day("2026-09-25"),
        real: zero,
        forecast: { grossCents: 60_000, partnerShareCents: 12_000, commissionCents: 0, netCents: 48_000 },
      },
    ]);
    expect(result.total).toEqual({
      real: { grossCents: 40_000, partnerShareCents: 8_000, commissionCents: 0, netCents: 32_000 },
      forecast: { grossCents: 100_000, partnerShareCents: 20_000, commissionCents: 0, netCents: 80_000 },
    });
  });

  it("intervalo que atravessa dois períodos de repasse soma a parte de cada um", () => {
    // Quinzenal: até R$ 500 paga 10% sobre o total; acima disso, 20% sobre o total.
    const share: RevenueShare = {
      period: "biweekly",
      tiers: [
        { upToCents: 50_000, percent: 10 },
        { upToCents: null, percent: 20 },
      ],
    };

    const result = summarizeCashFlow(
      [{ from: "2026-09-14", to: "2026-09-20" }],
      [total("2026-09-03", 60_000), total("2026-09-14", 10_000), total("2026-09-18", 10_000)],
      [],
      share,
      {},
    );

    // 1ª quinzena: R$ 700 -> 20% = R$ 140, dia 14 fica com 10.000/70.000 = R$ 20.
    // 2ª quinzena: R$ 100 -> 10% = R$ 10, todo do dia 18.
    expect(result.buckets[0].real).toEqual({ grossCents: 20_000, partnerShareCents: 3_000, commissionCents: 0, netCents: 17_000 });
  });

  it("comissão: percentual de cada profissional sobre o que ele fez, descontado do líquido", () => {
    const result = summarizeCashFlow(
      [day("2026-09-21"), day("2026-09-25")],
      [total("2026-09-21", 10_000, "ana"), total("2026-09-21", 20_000, "bia")],
      [total("2026-09-25", 5_000, "ana")],
      null,
      { ana: 40, bia: 25 },
    );

    // Dia 21: Ana 40% de R$ 100 = R$ 40; Bia 25% de R$ 200 = R$ 50.
    // Dia 25 (previsto): Ana 40% de R$ 50 = R$ 20.
    expect(result.buckets).toEqual([
      {
        ...day("2026-09-21"),
        real: { grossCents: 30_000, partnerShareCents: 0, commissionCents: 9_000, netCents: 21_000 },
        forecast: { grossCents: 30_000, partnerShareCents: 0, commissionCents: 9_000, netCents: 21_000 },
      },
      {
        ...day("2026-09-25"),
        real: zero,
        forecast: { grossCents: 5_000, partnerShareCents: 0, commissionCents: 2_000, netCents: 3_000 },
      },
    ]);
    expect(result.total).toEqual({
      real: { grossCents: 30_000, partnerShareCents: 0, commissionCents: 9_000, netCents: 21_000 },
      forecast: { grossCents: 35_000, partnerShareCents: 0, commissionCents: 11_000, netCents: 24_000 },
    });
  });

  it("profissional sem comissão definida (ou o proprietário) não gera comissão", () => {
    const result = summarizeCashFlow(
      [day("2026-09-21")],
      [total("2026-09-21", 10_000, "ana"), total("2026-09-21", 20_000, "dono")],
      [],
      null,
      { ana: 10 },
    );

    expect(result.total.real).toEqual({ grossCents: 30_000, partnerShareCents: 0, commissionCents: 1_000, netCents: 29_000 });
  });

  it("repasse e comissão são calculados sobre o bruto e ambos saem do líquido", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };

    const result = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_000, "ana")], [], share, { ana: 30 });

    expect(result.total.real).toEqual({ grossCents: 10_000, partnerShareCents: 2_000, commissionCents: 3_000, netCents: 5_000 });
  });

  it("comissão arredonda por intervalo; o total soma os intervalos arredondados", () => {
    // 33,33% de R$ 1,00 = 33,33 centavos por dia.
    const result = summarizeCashFlow(
      [{ from: "2026-09-21", to: "2026-09-22" }, day("2026-09-23")],
      [total("2026-09-21", 100), total("2026-09-22", 100), total("2026-09-23", 100)],
      [],
      null,
      { ana: 33.33 },
    );

    expect(result.buckets.map((bucket) => bucket.real.commissionCents)).toEqual([67, 33]);
    expect(result.total.real.commissionCents).toBe(100);
  });
});

describe("applyStaffCosts", () => {
  // Setembro de 2026 tem 30 dias: R$ 3.000 por mês = R$ 100 por dia.
  const SALARY = { grossCommissionPercent: 0, netCommissionPercent: 0, salaries: [{ monthlyCents: 300_000, startDate: null }], today: "2026-09-24" };

  it("sem salário nem comissão sobre o bruto, só acrescenta salário zerado", () => {
    const summary = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_000)], [], null, { ana: 10 });

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, netCommissionPercent: 0, salaries: [], today: "2026-09-24" });

    const amounts = { grossCents: 10_000, partnerShareCents: 0, commissionCents: 1_000, salaryCents: 0, netCents: 9_000 };
    expect(result).toEqual({
      buckets: [{ ...day("2026-09-21"), real: amounts, forecast: amounts }],
      total: { real: amounts, forecast: amounts },
    });
  });

  it("salário mensal rateado por dia; real conta só até hoje, previsto conta o intervalo inteiro", () => {
    const summary = summarizeCashFlow([RANGE], [total("2026-09-21", 50_000)], [total("2026-09-26", 20_000)], null, {});

    const result = applyStaffCosts(summary, SALARY);

    // Real: 21 a 24 = 4 dias = R$ 400. Previsto: 21 a 27 = 7 dias = R$ 700.
    const real = { grossCents: 50_000, partnerShareCents: 0, commissionCents: 0, salaryCents: 40_000, netCents: 10_000 };
    const forecast = { grossCents: 70_000, partnerShareCents: 0, commissionCents: 0, salaryCents: 70_000, netCents: 0 };
    expect(result).toEqual({ buckets: [{ ...RANGE, real, forecast }], total: { real, forecast } });
  });

  it("intervalo todo no futuro: salário só no previsto", () => {
    const summary = summarizeCashFlow([day("2026-09-30")], [], [], null, {});

    const [bucket] = applyStaffCosts(summary, SALARY).buckets;

    expect(bucket.real).toEqual({ grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, netCents: 0 });
    expect(bucket.forecast).toEqual({ grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 10_000, netCents: -10_000 });
  });

  it("semana que atravessa meses usa os dias de cada mês", () => {
    const summary = summarizeCashFlow([{ from: "2026-09-28", to: "2026-10-04" }], [], [], null, {});

    const [bucket] = applyStaffCosts(summary, { ...SALARY, today: "2026-12-31" }).buckets;

    // Setembro: 3 dias × 300.000/30. Outubro: 4 dias × 300.000/31 = 38.709,68.
    expect(bucket.real.salaryCents).toBe(68_710);
    expect(bucket.forecast.salaryCents).toBe(68_710);
  });

  it("visão anual: cada mês passado recebe o salário inteiro", () => {
    const summary = summarizeCashFlow(cashFlowBuckets({ view: "year", date: "2026-09-24" }), [], [], null, {});

    const result = applyStaffCosts(summary, SALARY);

    expect(result.buckets.slice(0, 3).map((bucket) => bucket.real.salaryCents)).toEqual([300_000, 300_000, 300_000]);
    // Setembro até o dia 24: 24 × R$ 100.
    expect(result.buckets[8].real.salaryCents).toBe(240_000);
    expect(result.buckets[8].forecast.salaryCents).toBe(300_000);
    expect(result.total.forecast.salaryCents).toBe(3_600_000);
  });

  it("comissão sobre o bruto (recepcionista) soma à comissão dos profissionais e sai do líquido", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };
    const summary = summarizeCashFlow(
      [day("2026-09-21"), day("2026-09-26")],
      [total("2026-09-21", 10_000, "ana")],
      [total("2026-09-26", 30_000, "ana")],
      share,
      { ana: 30 },
    );

    const result = applyStaffCosts(summary, { grossCommissionPercent: 5, netCommissionPercent: 0, salaries: [], today: "2026-09-24" });

    // Dia 21: 30% da Ana (R$ 30) + 5% do bruto (R$ 5); repasse 20% (R$ 20).
    expect(result.buckets[0].real).toEqual({
      grossCents: 10_000,
      partnerShareCents: 2_000,
      commissionCents: 3_500,
      salaryCents: 0,
      netCents: 4_500,
    });
    // Dia 26 (previsto): 30% da Ana (R$ 90) + 5% do bruto (R$ 15); repasse 20% (R$ 60).
    expect(result.buckets[1].forecast).toEqual({
      grossCents: 30_000,
      partnerShareCents: 6_000,
      commissionCents: 10_500,
      salaryCents: 0,
      netCents: 13_500,
    });
    expect(result.total.forecast.commissionCents).toBe(14_000);
  });

  it("comissão sobre o líquido incide no bruto menos o repasse e soma às demais", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };
    const summary = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_000, "ana")], [], share, { ana: 30 });

    const result = applyStaffCosts(summary, { grossCommissionPercent: 5, netCommissionPercent: 10, salaries: [], today: "2026-09-24" });

    // 30% da Ana (R$ 30) + 5% do bruto (R$ 5) + 10% de R$ 100 − R$ 20 de repasse (R$ 8).
    expect(result.buckets[0].real).toEqual({
      grossCents: 10_000,
      partnerShareCents: 2_000,
      commissionCents: 4_300,
      salaryCents: 0,
      netCents: 3_700,
    });
  });

  it("comissão sobre o líquido sem repasse (espaço próprio) incide no bruto", () => {
    const summary = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_000)], [], null, {});

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, netCommissionPercent: 10, salaries: [], today: "2026-09-24" });

    expect(result.buckets[0].real).toMatchObject({ commissionCents: 1_000, netCents: 9_000 });
  });

  it("comissão sobre o líquido arredonda por intervalo", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };
    const summary = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_001)], [], share, {});

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, netCommissionPercent: 2.5, salaries: [], today: "2026-09-24" });

    // Repasse 2.000,2 → 2.000; 2,5% de 8.001 = 200,025.
    expect(result.buckets[0].real.commissionCents).toBe(200);
  });

  it("arredonda por intervalo; o total soma os intervalos arredondados", () => {
    // R$ 1,00 por mês em setembro = 3,33 centavos por dia.
    const summary = summarizeCashFlow([day("2026-09-21"), day("2026-09-22")], [], [], null, {});

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, netCommissionPercent: 0, salaries: [{ monthlyCents: 100, startDate: null }], today: "2026-09-24" });

    expect(result.buckets.map((bucket) => bucket.real.salaryCents)).toEqual([3, 3]);
    expect(result.total.real).toEqual({ grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 6, netCents: -6 });
  });

  it("salário só conta a partir da data de início, proporcional no primeiro mês", () => {
    const summary = summarizeCashFlow(cashFlowBuckets({ view: "year", date: "2026-09-24" }), [], [], null, {});

    // Fevereiro de 2026 tem 28 dias: entrou no dia 15, conta 14 dias de R$ 3.000/28.
    const result = applyStaffCosts(summary, { ...SALARY, salaries: [{ monthlyCents: 300_000, startDate: "2026-02-15" }] });

    expect(result.buckets.slice(0, 4).map((bucket) => bucket.forecast.salaryCents)).toEqual([0, 150_000, 300_000, 300_000]);
    expect(result.buckets[0].real.salaryCents).toBe(0);
    expect(result.buckets[1].real.salaryCents).toBe(150_000);
    // Fevereiro pela metade + março a dezembro.
    expect(result.total.forecast.salaryCents).toBe(150_000 + 10 * 300_000);
  });

  it("cada salário conta a partir da própria data de início; sem data conta sempre", () => {
    const summary = summarizeCashFlow([RANGE], [], [], null, {});

    const result = applyStaffCosts(summary, {
      ...SALARY,
      salaries: [
        { monthlyCents: 300_000, startDate: null },
        { monthlyCents: 300_000, startDate: "2026-09-23" },
        { monthlyCents: 300_000, startDate: "2026-10-01" },
      ],
    });

    // Real (21 a 24): 4 dias do primeiro + 2 do segundo. Previsto (21 a 27): 7 + 5.
    expect(result.buckets[0].real.salaryCents).toBe(60_000);
    expect(result.buckets[0].forecast.salaryCents).toBe(120_000);
  });

  it("data de início no futuro: salário só no previsto a partir dela", () => {
    const summary = summarizeCashFlow([RANGE], [], [], null, {});

    const result = applyStaffCosts(summary, { ...SALARY, salaries: [{ monthlyCents: 300_000, startDate: "2026-09-26" }] });

    expect(result.buckets[0].real.salaryCents).toBe(0);
    expect(result.buckets[0].forecast.salaryCents).toBe(20_000);
  });
});

describe("summarizeTherapists", () => {
  it("sem movimento, lista vazia", () => {
    expect(summarizeTherapists(RANGE, [], [], {})).toEqual([]);
  });

  it("real soma atendimentos; previsto soma atendimentos e agendamentos; comissão pelo percentual; ordena pelo previsto", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-21", 10_000, "ana", 1), total("2026-09-22", 30_000, "bia", 2), total("2026-09-23", 5_000, "ana", 1)],
      [total("2026-09-26", 20_000, "ana", 2)],
      { ana: 40 },
    );

    expect(result).toEqual([
      {
        therapistId: "ana",
        therapistName: "Ana",
        commissionPercent: 40,
        real: { count: 2, cents: 15_000, commissionCents: 6_000 },
        forecast: { count: 4, cents: 35_000, commissionCents: 14_000 },
      },
      {
        therapistId: "bia",
        therapistName: "Bia",
        commissionPercent: null,
        real: { count: 2, cents: 30_000, commissionCents: 0 },
        forecast: { count: 2, cents: 30_000, commissionCents: 0 },
      },
    ]);
  });

  it("ignora dias fora do intervalo exibido", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-20", 99_000, "ana"), total("2026-09-21", 10_000, "ana")],
      [total("2026-09-28", 99_000, "ana")],
      {},
    );

    expect(result.map((row) => row.forecast)).toEqual([{ count: 1, cents: 10_000, commissionCents: 0 }]);
  });

  it("usa o nome mais recente, vindo dos agendamentos", () => {
    const [row] = summarizeTherapists(
      RANGE,
      [{ ...total("2026-09-21", 10_000, "ana"), therapistName: "Ana" }],
      [{ ...total("2026-09-26", 10_000, "ana"), therapistName: "Ana Souza" }],
      {},
    );

    expect(row.therapistName).toBe("Ana Souza");
  });

  it("empate no previsto desempata pelo nome", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-21", 10_000, "bia"), total("2026-09-21", 10_000, "ana")],
      [],
      {},
    );

    expect(result.map((row) => row.therapistName)).toEqual(["Ana", "Bia"]);
  });
});

const PROJECT_SERVICE = { $project: { _id: 0, serviceId: { $toString: "$_id" }, serviceName: 1, count: 1, cents: 1 } };

describe("serviceAppointmentTotalsPipeline", () => {
  it("filtra o intervalo em Brasília e soma cada serviço, com o nome do registro mais recente", () => {
    expect(serviceAppointmentTotalsPipeline(RANGE)).toEqual([
      {
        $match: {
          performedAt: { $gte: new Date("2026-09-21T03:00:00.000Z"), $lt: new Date("2026-09-28T03:00:00.000Z") },
        },
      },
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
      PROJECT_SERVICE,
    ]);
  });
});

describe("serviceBookingForecastPipeline", () => {
  it("só conta agendamentos a partir de agora, com o nome e o preço atuais do serviço", () => {
    expect(serviceBookingForecastPipeline(RANGE, NOW)).toEqual([
      { $match: { startsAt: { $gte: NOW, $lt: new Date("2026-09-28T03:00:00.000Z") } } },
      {
        $lookup: {
          from: "services",
          localField: "service.serviceId",
          foreignField: "_id",
          as: "services",
          pipeline: [{ $project: { _id: 0, name: 1, priceCents: 1 } }],
        },
      },
      // Serviço excluído mantém o nome copiado no agendamento e conta como zero.
      {
        $group: {
          _id: "$service.serviceId",
          serviceName: { $last: { $ifNull: [{ $first: "$services.name" }, "$service.serviceName"] } },
          count: { $sum: 1 },
          cents: { $sum: { $ifNull: [{ $first: "$services.priceCents" }, 0] } },
        },
      },
      PROJECT_SERVICE,
    ]);
  });
});

describe("summarizeServices", () => {
  it("sem movimento, lista vazia", () => {
    expect(summarizeServices([], [])).toEqual([]);
  });

  it("real soma atendimentos; previsto soma atendimentos e agendamentos; ordena pelo previsto", () => {
    const result = summarizeServices(
      [
        { serviceId: "a", serviceName: "Relaxante", count: 2, cents: 20_000 },
        { serviceId: "b", serviceName: "Pedras quentes", count: 1, cents: 15_000 },
      ],
      [
        { serviceId: "b", serviceName: "Pedras quentes", count: 1, cents: 15_000 },
        { serviceId: "c", serviceName: "Reflexologia", count: 1, cents: 8_000 },
      ],
    );

    expect(result).toEqual([
      { serviceId: "b", serviceName: "Pedras quentes", real: { count: 1, cents: 15_000 }, forecast: { count: 2, cents: 30_000 } },
      { serviceId: "a", serviceName: "Relaxante", real: { count: 2, cents: 20_000 }, forecast: { count: 2, cents: 20_000 } },
      { serviceId: "c", serviceName: "Reflexologia", real: { count: 0, cents: 0 }, forecast: { count: 1, cents: 8_000 } },
    ]);
  });

  it("serviço renomeado usa o nome atual, vindo dos agendamentos", () => {
    const [row] = summarizeServices(
      [{ serviceId: "a", serviceName: "Massagem", count: 1, cents: 10_000 }],
      [{ serviceId: "a", serviceName: "Massagem relaxante", count: 1, cents: 10_000 }],
    );

    expect(row.serviceName).toBe("Massagem relaxante");
  });

  it("empate no previsto desempata pelo nome", () => {
    const result = summarizeServices(
      [
        { serviceId: "z", serviceName: "Shiatsu", count: 1, cents: 10_000 },
        { serviceId: "y", serviceName: "Drenagem", count: 1, cents: 10_000 },
      ],
      [],
    );

    expect(result.map((row) => row.serviceName)).toEqual(["Drenagem", "Shiatsu"]);
  });
});

describe("teamPayRates", () => {
  const UNIT = new Types.ObjectId();
  const OTHER_UNIT = new Types.ObjectId();
  const ANA = new Types.ObjectId();
  const BIA = new Types.ObjectId();
  const link = (commissionPercent: number | null, salaryCents: number | null, unitId = UNIT, startDate: string | null = null) => ({
    unitId,
    commissionPercent,
    salaryCents,
    startDate,
  });

  it("sem equipe, não há comissão nem salário", () => {
    expect(teamPayRates([], UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 0,
      netCommissionPercent: 0,
      salaries: [],
    });
  });

  it("comissão de quem realiza atendimentos vai pelo id de usuário", () => {
    const team = [
      { userId: ANA, attends: true, units: [link(30, null)] },
      { userId: BIA, attends: true, units: [link(12.5, null)] },
    ];

    expect(teamPayRates(team, UNIT.toString()).commissionRates).toEqual({
      [ANA.toString()]: 30,
      [BIA.toString()]: 12.5,
    });
  });

  it("comissões de quem não realiza atendimentos somam no percentual sobre o bruto", () => {
    const team = [
      { userId: ANA, attends: false, units: [link(2, null)] },
      { userId: null, attends: false, units: [link(1.5, null)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 3.5,
      netCommissionPercent: 0,
      salaries: [],
    });
  });

  it("salários de qualquer função somam, mesmo com convite pendente", () => {
    const team = [
      { userId: ANA, attends: true, units: [link(null, 250_000)] },
      { userId: null, attends: false, units: [link(null, 180_000)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 0,
      netCommissionPercent: 0,
      salaries: [
        { monthlyCents: 250_000, startDate: null },
        { monthlyCents: 180_000, startDate: null },
      ],
    });
  });

  it("comissão e salário do mesmo vínculo valem juntos", () => {
    const team = [
      { userId: ANA, attends: true, units: [link(20, 150_000)] },
      { userId: BIA, attends: false, units: [link(2, 180_000)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 20 },
      grossCommissionPercent: 2,
      netCommissionPercent: 0,
      salaries: [
        { monthlyCents: 150_000, startDate: null },
        { monthlyCents: 180_000, startDate: null },
      ],
    });
  });

  it("bônus fixos mensais somam com os salários, mesmo com convite pendente", () => {
    const bonus = (amountCents: number) => ({ description: "Bônus", amountCents });
    const team = [
      { userId: ANA, attends: true, units: [{ ...link(30, null), bonuses: [bonus(20_000), bonus(5_000)] }] },
      { userId: null, attends: false, units: [{ ...link(null, 180_000), bonuses: [bonus(10_000)] }] },
      { userId: BIA, attends: false, units: [{ ...link(null, null, OTHER_UNIT), bonuses: [bonus(99_000)] }] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 30 },
      grossCommissionPercent: 0,
      netCommissionPercent: 0,
      salaries: [
        { monthlyCents: 25_000, startDate: null },
        { monthlyCents: 190_000, startDate: null },
      ],
    });
  });

  it("ignora comissão de profissional com convite pendente, que ainda não faz serviços", () => {
    const team = [{ userId: null, attends: true, units: [link(30, null)] }];

    expect(teamPayRates(team, UNIT.toString()).commissionRates).toEqual({});
  });

  it("usa só o vínculo com a unidade pedida", () => {
    const team = [
      { userId: ANA, attends: true, units: [link(40, null, OTHER_UNIT), link(30, null)] },
      { userId: BIA, attends: false, units: [link(5, 200_000, OTHER_UNIT)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 30 },
      grossCommissionPercent: 0,
      netCommissionPercent: 0,
      salaries: [],
    });
  });

  it("cada vínculo com salário ou bônus leva a própria data de início", () => {
    const bonus = { description: "Bônus", amountCents: 10_000 };
    const team = [
      { userId: ANA, attends: true, units: [link(20, 300_000, UNIT, "2026-02-15")] },
      { userId: BIA, attends: false, units: [{ ...link(null, null, UNIT, "2026-03-01"), bonuses: [bonus] }] },
      { userId: null, attends: false, units: [link(2, null, UNIT, "2026-04-01")] },
    ];

    expect(teamPayRates(team, UNIT.toString()).salaries).toEqual([
      { monthlyCents: 300_000, startDate: "2026-02-15" },
      { monthlyCents: 10_000, startDate: "2026-03-01" },
    ]);
  });

  // A base escolhida no vínculo vale mais que a da função (attends), que só vale para
  // vínculos antigos, sem base guardada.
  it("comissão sobre o bruto ou sobre os serviços conforme a base do vínculo", () => {
    const team = [
      { userId: ANA, attends: true, units: [{ ...link(3, null), commissionBase: "gross" as const }] },
      { userId: BIA, attends: false, units: [{ ...link(25, null), commissionBase: "services" as const }] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [BIA.toString()]: 25 },
      grossCommissionPercent: 3,
      netCommissionPercent: 0,
      salaries: [],
    });
  });

  it("comissões sobre o líquido somam num percentual próprio, mesmo com convite pendente", () => {
    const team = [
      { userId: ANA, attends: true, units: [{ ...link(4, null), commissionBase: "net" as const }] },
      { userId: null, attends: false, units: [{ ...link(1.5, null), commissionBase: "net" as const }] },
      { userId: BIA, attends: false, units: [{ ...link(2, null), commissionBase: "gross" as const }] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 2,
      netCommissionPercent: 5.5,
      salaries: [],
    });
  });

  it("vínculo sem base guardada usa a da função", () => {
    const team = [
      { userId: ANA, attends: true, units: [{ ...link(30, null), commissionBase: null }] },
      { userId: BIA, attends: false, units: [{ ...link(2, null), commissionBase: null }] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 30 },
      grossCommissionPercent: 2,
      netCommissionPercent: 0,
      salaries: [],
    });
  });

  it("administrador vinculado à unidade entra como qualquer pessoa da equipe", () => {
    const team = [{ userId: ANA, admin: true, attends: true, units: [link(10, 300_000)] }];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 10 },
      grossCommissionPercent: 0,
      netCommissionPercent: 0,
      salaries: [{ monthlyCents: 300_000, startDate: null }],
    });
  });
});

describe("applyExpenses", () => {
  const STAFF = { grossCommissionPercent: 0, netCommissionPercent: 0, salaries: [], today: "2026-09-24" };
  const WEEK = [day("2026-09-21"), day("2026-09-22")];
  // Semana com R$ 100 de bruto na segunda e nada na terça, sem descontos.
  const summary = () => applyStaffCosts(summarizeCashFlow(WEEK, [total("2026-09-21", 10_000)], [], null, {}), STAFF);
  const amounts = (grossCents: number, expenseCents: number) => ({
    grossCents,
    partnerShareCents: 0,
    commissionCents: 0,
    salaryCents: 0,
    expenseCents,
    netCents: grossCents - expenseCents,
  });

  it("sem despesas, acrescenta despesa zerada", () => {
    const result = applyExpenses(summary(), []);

    expect(result.buckets.map((bucket) => bucket.real)).toEqual([amounts(10_000, 0), amounts(0, 0)]);
    expect(result.total.forecast).toEqual(amounts(10_000, 0));
  });

  it("real desconta só o que foi pago; previsto desconta tudo, cada um no dia do lançamento", () => {
    const result = applyExpenses(summary(), [
      { date: "2026-09-21", totalCents: 3_000, paidCents: 1_000 },
      { date: "2026-09-22", totalCents: 500, paidCents: 0 },
    ]);

    expect(result.buckets).toEqual([
      { ...day("2026-09-21"), real: amounts(10_000, 1_000), forecast: amounts(10_000, 3_000) },
      { ...day("2026-09-22"), real: amounts(0, 0), forecast: amounts(0, 500) },
    ]);
    expect(result.total).toEqual({ real: amounts(10_000, 1_000), forecast: amounts(10_000, 3_500) });
  });

  it("despesa maior que o bruto deixa o líquido negativo", () => {
    const result = applyExpenses(summary(), [{ date: "2026-09-22", totalCents: 2_000, paidCents: 2_000 }]);

    expect(result.buckets[1].real.netCents).toBe(-2_000);
  });

  it("ignora despesas fora dos intervalos", () => {
    const result = applyExpenses(summary(), [
      { date: "2026-09-20", totalCents: 700, paidCents: 700 },
      { date: "2026-09-23", totalCents: 900, paidCents: 900 },
    ]);

    expect(result.total).toEqual({ real: amounts(10_000, 0), forecast: amounts(10_000, 0) });
  });

  it("soma no intervalo as despesas de todos os dias dele", () => {
    const month = applyStaffCosts(summarizeCashFlow([{ from: "2026-09-21", to: "2026-09-27" }], [], [], null, {}), STAFF);

    const result = applyExpenses(month, [
      { date: "2026-09-21", totalCents: 100, paidCents: 100 },
      { date: "2026-09-27", totalCents: 200, paidCents: 0 },
    ]);

    expect(result.total).toEqual({ real: amounts(0, 100), forecast: amounts(0, 300) });
  });
});

describe("summarizeCosts", () => {
  const RENT = { id: "g1", name: "Aluguel", paidCents: 300_000 };
  const TAXES = { id: "g2", name: "Impostos", paidCents: 50_000 };
  const SUPPLIES = { id: "g3", name: "Insumos", paidCents: 0 };

  it("junta repasse, comissão, salário e grupos, do maior para o menor, com a fatia de cada um no total", () => {
    const result = summarizeCosts({ partnerShareCents: 100_000, commissionCents: 40_000, salaryCents: 200_000 }, [
      RENT,
      TAXES,
    ]);

    expect(result).toEqual({
      totalCents: 690_000,
      rows: [
        { kind: "group", group: RENT, cents: 300_000, share: 300_000 / 690_000 },
        { kind: "salary", cents: 200_000, share: 200_000 / 690_000 },
        { kind: "partner_share", cents: 100_000, share: 100_000 / 690_000 },
        { kind: "group", group: TAXES, cents: 50_000, share: 50_000 / 690_000 },
        { kind: "commission", cents: 40_000, share: 40_000 / 690_000 },
      ],
    });
  });

  it("deixa de fora o que ficou em zero", () => {
    const result = summarizeCosts({ partnerShareCents: 0, commissionCents: 10_000, salaryCents: 0 }, [SUPPLIES, TAXES]);

    expect(result).toEqual({
      totalCents: 60_000,
      rows: [
        { kind: "group", group: TAXES, cents: 50_000, share: 50_000 / 60_000 },
        { kind: "commission", cents: 10_000, share: 10_000 / 60_000 },
      ],
    });
  });

  it("no empate, a equipe e o repasse vêm antes dos grupos, e os grupos na ordem recebida", () => {
    const a = { id: "a", name: "B", paidCents: 1_000 };
    const b = { id: "b", name: "A", paidCents: 1_000 };
    const result = summarizeCosts({ partnerShareCents: 1_000, commissionCents: 1_000, salaryCents: 1_000 }, [a, b]);

    expect(result.rows.map((row) => (row.kind === "group" ? row.group.id : row.kind))).toEqual([
      "partner_share",
      "commission",
      "salary",
      "a",
      "b",
    ]);
  });

  it("sem gasto nenhum, não tem linhas e o total é zero", () => {
    expect(summarizeCosts({ partnerShareCents: 0, commissionCents: 0, salaryCents: 0 }, [SUPPLIES])).toEqual({
      totalCents: 0,
      rows: [],
    });
  });
});

describe("costCurve", () => {
  // Custos de um mês. Repasse, comissão e salário ficam altos para mostrar que não entram na curva.
  const costs = (expenseCents: number) => ({
    grossCents: 999_999,
    partnerShareCents: 1_111,
    commissionCents: 2_222,
    salaryCents: 3_333,
    expenseCents,
    netCents: -1,
  });
  // Real: despesas pagas, que são o gasto da curva. Previsto: todas as lançadas, que não entram.
  const month = (from: string, to: string, paidCents: number, launchedCents = 9_999) => ({
    from,
    to,
    real: costs(paidCents),
    forecast: costs(launchedCents),
  });
  // Grupo de despesas com o limite antes de qualquer mudança e as mudanças por mês.
  const group = (monthlyLimitCents: number | null, limitChanges: { month: string; cents: number | null }[] = []) => ({
    monthlyLimitCents,
    limitChanges,
  });
  const JUL = { from: "2026-07-01", to: "2026-07-31" };
  const AUG = { from: "2026-08-01", to: "2026-08-31" };
  const SEP = { from: "2026-09-01", to: "2026-09-30" };
  const DEC = { from: "2026-12-01", to: "2026-12-31" };

  it("planejado é o limite mensal dos grupos e gasto são as despesas pagas, com o acumulado", () => {
    const result = costCurve([
      { groups: [group(1_500)], buckets: [month(JUL.from, JUL.to, 1_000), month(AUG.from, AUG.to, 350)] },
    ]);

    expect(result).toEqual([
      { ...JUL, plannedCents: 1_500, spentCents: 1_000, plannedCumulativeCents: 1_500, spentCumulativeCents: 1_000 },
      { ...AUG, plannedCents: 1_500, spentCents: 350, plannedCumulativeCents: 3_000, spentCumulativeCents: 1_350 },
    ]);
  });

  it("despesa lançada e não paga não conta no gasto", () => {
    const result = costCurve([{ groups: [], buckets: [month(JUL.from, JUL.to, 200, 500)] }]);

    expect(result[0].spentCents).toBe(200);
  });

  it("despesa paga num mês futuro já conta no gasto daquele mês", () => {
    const result = costCurve([
      { groups: [group(100)], buckets: [month(SEP.from, SEP.to, 100), month(DEC.from, DEC.to, 70)] },
    ]);

    expect(result).toEqual([
      { ...SEP, plannedCents: 100, spentCents: 100, plannedCumulativeCents: 100, spentCumulativeCents: 100 },
      { ...DEC, plannedCents: 100, spentCents: 70, plannedCumulativeCents: 200, spentCumulativeCents: 170 },
    ]);
  });

  it("com várias unidades, soma os limites e as despesas pagas de todas", () => {
    const result = costCurve([
      { groups: [group(200)], buckets: [month(JUL.from, JUL.to, 100)] },
      { groups: [group(70)], buckets: [month(JUL.from, JUL.to, 30)] },
    ]);

    expect(result).toEqual([
      { ...JUL, plannedCents: 270, spentCents: 130, plannedCumulativeCents: 270, spentCumulativeCents: 130 },
    ]);
  });

  it("intervalos menores que o mês recebem o limite pelos dias, com cada mês dividido pelos próprios dias", () => {
    // Setembro tem 30 dias: R$ 3.000 = R$ 100 por dia. Outubro tem 31 dias.
    const result = costCurve([
      {
        groups: [group(300_000)],
        buckets: [month("2026-09-21", "2026-09-27", 0), month("2026-09-28", "2026-10-04", 0)],
      },
    ]);

    // 3 dias de setembro (30.000) + 4 de outubro (4 × 300.000/31 = 38.709,68).
    expect(result.map((point) => point.plannedCents)).toEqual([70_000, 68_710]);
    expect(result[1].plannedCumulativeCents).toBe(138_710);
  });

  it("o planejado de cada mês usa o limite de cada grupo naquele mês", () => {
    const result = costCurve([
      {
        groups: [group(10_000, [{ month: "2026-08", cents: 15_000 }]), group(5_000, [{ month: "2026-09", cents: null }]), group(null)],
        buckets: [month(JUL.from, JUL.to, 0), month(AUG.from, AUG.to, 0), month(SEP.from, SEP.to, 0)],
      },
    ]);

    expect(result.map((point) => point.plannedCents)).toEqual([15_000, 20_000, 15_000]);
    expect(result.map((point) => point.plannedCumulativeCents)).toEqual([15_000, 35_000, 50_000]);
  });

  it("intervalo que cruza a mudança de limite usa o limite de cada dia", () => {
    // 28 a 30 de setembro: 3 × 30.000/30; 1 a 4 de outubro: 4 × 62.000/31.
    const result = costCurve([
      { groups: [group(30_000, [{ month: "2026-10", cents: 62_000 }])], buckets: [month("2026-09-28", "2026-10-04", 0)] },
    ]);

    expect(result[0].plannedCents).toBe(3_000 + 8_000);
  });

  it("sem limite nos grupos, o planejado fica zerado", () => {
    const result = costCurve([{ groups: [], buckets: [month(JUL.from, JUL.to, 10)] }]);

    expect(result).toEqual([
      { ...JUL, plannedCents: 0, spentCents: 10, plannedCumulativeCents: 0, spentCumulativeCents: 10 },
    ]);
  });

  it("sem unidades, a curva fica vazia", () => {
    expect(costCurve([])).toEqual([]);
  });
});
