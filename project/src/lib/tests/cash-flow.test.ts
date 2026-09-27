import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowBuckets,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  dailyBookingForecastPipeline,
  parseCashFlowQuery,
  serviceAppointmentTotalsPipeline,
  serviceBookingForecastPipeline,
  shiftCashFlowDate,
  summarizeCashFlow,
  summarizeServices,
  summarizeTherapists,
  teamPayRates,
} from "@/lib/cash-flow";
import type { RevenueShare } from "@/lib/revenue-share";

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
  it("filtra o intervalo em Brasília e soma os serviços por dia e massagista, com o nome mais recente", () => {
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

  it("só conta agendamentos a partir de agora, com o preço atual do serviço, por dia e massagista", () => {
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

// Total de um dia de uma massagista, como vem das pipelines diárias.
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

  it("massagistas do mesmo dia somam no bruto", () => {
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

  it("comissão: percentual de cada massagista sobre o que ela fez, descontado do líquido", () => {
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

  it("massagista sem comissão definida (ou o proprietário) não gera comissão", () => {
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
  const SALARY = { grossCommissionPercent: 0, monthlySalaryCents: 300_000, today: "2026-09-24" };

  it("sem salário nem comissão sobre o bruto, só acrescenta salário zerado", () => {
    const summary = summarizeCashFlow([day("2026-09-21")], [total("2026-09-21", 10_000)], [], null, { ana: 10 });

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, monthlySalaryCents: 0, today: "2026-09-24" });

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

  it("comissão sobre o bruto (recepcionista) soma à comissão das massagistas e sai do líquido", () => {
    const share: RevenueShare = { period: "weekly", tiers: [{ upToCents: null, percent: 20 }] };
    const summary = summarizeCashFlow(
      [day("2026-09-21"), day("2026-09-26")],
      [total("2026-09-21", 10_000, "ana")],
      [total("2026-09-26", 30_000, "ana")],
      share,
      { ana: 30 },
    );

    const result = applyStaffCosts(summary, { grossCommissionPercent: 5, monthlySalaryCents: 0, today: "2026-09-24" });

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

  it("arredonda por intervalo; o total soma os intervalos arredondados", () => {
    // R$ 1,00 por mês em setembro = 3,33 centavos por dia.
    const summary = summarizeCashFlow([day("2026-09-21"), day("2026-09-22")], [], [], null, {});

    const result = applyStaffCosts(summary, { grossCommissionPercent: 0, monthlySalaryCents: 100, today: "2026-09-24" });

    expect(result.buckets.map((bucket) => bucket.real.salaryCents)).toEqual([3, 3]);
    expect(result.total.real).toEqual({ grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 6, netCents: -6 });
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
  const link = (commissionPercent: number | null, salaryCents: number | null, unitId = UNIT) => ({
    unitId,
    commissionPercent,
    salaryCents,
  });

  it("sem equipe, não há comissão nem salário", () => {
    expect(teamPayRates([], UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 0,
      monthlySalaryCents: 0,
    });
  });

  it("comissão de massagista vai pelo id de usuário", () => {
    const team = [
      { userId: ANA, role: "massage_therapist", units: [link(30, null)] },
      { userId: BIA, role: "massage_therapist", units: [link(12.5, null)] },
    ];

    expect(teamPayRates(team, UNIT.toString()).commissionRates).toEqual({
      [ANA.toString()]: 30,
      [BIA.toString()]: 12.5,
    });
  });

  it("comissões de recepcionistas somam no percentual sobre o bruto", () => {
    const team = [
      { userId: ANA, role: "receptionist", units: [link(2, null)] },
      { userId: null, role: "receptionist", units: [link(1.5, null)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 3.5,
      monthlySalaryCents: 0,
    });
  });

  it("salários de qualquer função somam, mesmo com convite pendente", () => {
    const team = [
      { userId: ANA, role: "massage_therapist", units: [link(null, 250_000)] },
      { userId: null, role: "receptionist", units: [link(null, 180_000)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 0,
      monthlySalaryCents: 430_000,
    });
  });

  it("comissão e salário do mesmo vínculo valem juntos", () => {
    const team = [
      { userId: ANA, role: "massage_therapist", units: [link(20, 150_000)] },
      { userId: BIA, role: "receptionist", units: [link(2, 180_000)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 20 },
      grossCommissionPercent: 2,
      monthlySalaryCents: 330_000,
    });
  });

  it("bônus fixos mensais somam com os salários, mesmo com convite pendente", () => {
    const bonus = (amountCents: number) => ({ description: "Bônus", amountCents });
    const team = [
      { userId: ANA, role: "massage_therapist", units: [{ ...link(30, null), bonuses: [bonus(20_000), bonus(5_000)] }] },
      { userId: null, role: "receptionist", units: [{ ...link(null, 180_000), bonuses: [bonus(10_000)] }] },
      { userId: BIA, role: "receptionist", units: [{ ...link(null, null, OTHER_UNIT), bonuses: [bonus(99_000)] }] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 30 },
      grossCommissionPercent: 0,
      monthlySalaryCents: 215_000,
    });
  });

  it("ignora comissão de massagista com convite pendente, que ainda não faz serviços", () => {
    const team = [{ userId: null, role: "massage_therapist", units: [link(30, null)] }];

    expect(teamPayRates(team, UNIT.toString()).commissionRates).toEqual({});
  });

  it("usa só o vínculo com a unidade pedida", () => {
    const team = [
      { userId: ANA, role: "massage_therapist", units: [link(40, null, OTHER_UNIT), link(30, null)] },
      { userId: BIA, role: "receptionist", units: [link(5, 200_000, OTHER_UNIT)] },
    ];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: { [ANA.toString()]: 30 },
      grossCommissionPercent: 0,
      monthlySalaryCents: 0,
    });
  });

  it("ignora administradores", () => {
    const team = [{ userId: ANA, role: "admin", units: [link(10, 300_000)] }];

    expect(teamPayRates(team, UNIT.toString())).toEqual({
      commissionRates: {},
      grossCommissionPercent: 0,
      monthlySalaryCents: 0,
    });
  });
});

describe("applyExpenses", () => {
  const STAFF = { grossCommissionPercent: 0, monthlySalaryCents: 0, today: "2026-09-24" };
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
