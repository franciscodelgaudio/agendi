import { describe, it, expect } from "vitest";
import {
  applyExpenses,
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
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";

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
  it("cobre do primeiro ao último intervalo exibido", () => {
    const buckets = cashFlowBuckets({ view: "month", date: "2026-09-24" });

    expect(cashFlowFetchRange(buckets)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
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
const zero = { grossCents: 0, netCents: 0 };

describe("summarizeCashFlow", () => {
  it("faturamento sem profissional entra no bruto", () => {
    const result = summarizeCashFlow(
      [day("2026-09-21")],
      [total("2026-09-21", 10_000, "ana"), { ...total("2026-09-21", 15_000), therapistId: null, therapistName: null }],
      [],
    );

    expect(result.total.real).toEqual({ grossCents: 25_000, netCents: 25_000 });
  });

  it("sem movimento, tudo zerado", () => {
    expect(summarizeCashFlow([day("2026-09-21")], [], [])).toEqual({
      buckets: [{ ...day("2026-09-21"), real: zero, forecast: zero }],
      total: { real: zero, forecast: zero },
    });
  });

  it("real soma atendimentos, previsto soma atendimentos e agendamentos", () => {
    const result = summarizeCashFlow(
      [{ from: "2026-09-21", to: "2026-09-22" }, day("2026-09-23")],
      [total("2026-09-21", 10_000), total("2026-09-22", 5_000)],
      [total("2026-09-23", 7_000)],
    );

    expect(result).toEqual({
      buckets: [
        {
          from: "2026-09-21",
          to: "2026-09-22",
          real: { grossCents: 15_000, netCents: 15_000 },
          forecast: { grossCents: 15_000, netCents: 15_000 },
        },
        {
          ...day("2026-09-23"),
          real: zero,
          forecast: { grossCents: 7_000, netCents: 7_000 },
        },
      ],
      total: {
        real: { grossCents: 15_000, netCents: 15_000 },
        forecast: { grossCents: 22_000, netCents: 22_000 },
      },
    });
  });

  it("profissionais do mesmo dia somam no bruto", () => {
    const result = summarizeCashFlow(
      [day("2026-09-21")],
      [total("2026-09-21", 10_000, "ana"), total("2026-09-21", 6_000, "bia")],
      [],
    );

    expect(result.total.real).toEqual({ grossCents: 16_000, netCents: 16_000 });
  });
});

describe("summarizeTherapists", () => {
  it("sem movimento, lista vazia", () => {
    expect(summarizeTherapists(RANGE, [], [])).toEqual([]);
  });

  it("real soma atendimentos; previsto soma atendimentos e agendamentos; ordena pelo previsto", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-21", 10_000, "ana", 1), total("2026-09-22", 30_000, "bia", 2), total("2026-09-23", 5_000, "ana", 1)],
      [total("2026-09-26", 20_000, "ana", 2)],
    );

    expect(result).toEqual([
      {
        therapistId: "ana",
        therapistName: "Ana",
        real: { count: 2, cents: 15_000 },
        forecast: { count: 4, cents: 35_000 },
      },
      {
        therapistId: "bia",
        therapistName: "Bia",
        real: { count: 2, cents: 30_000 },
        forecast: { count: 2, cents: 30_000 },
      },
    ]);
  });

  it("ignora dias fora do intervalo exibido", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-20", 99_000, "ana"), total("2026-09-21", 10_000, "ana")],
      [total("2026-09-28", 99_000, "ana")],
    );

    expect(result.map((row) => row.forecast)).toEqual([{ count: 1, cents: 10_000 }]);
  });

  // Serviços sem profissional (ex.: hidromassagem) vêm com therapistId null.
  it("deixa de fora o faturamento sem profissional", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-21", 10_000, "ana"), { ...total("2026-09-21", 15_000), therapistId: null, therapistName: null }],
      [{ ...total("2026-09-26", 15_000), therapistId: null, therapistName: null }],
    );

    expect(result.map((row) => row.therapistId)).toEqual(["ana"]);
  });

  it("usa o nome mais recente, vindo dos agendamentos", () => {
    const [row] = summarizeTherapists(
      RANGE,
      [{ ...total("2026-09-21", 10_000, "ana"), therapistName: "Ana" }],
      [{ ...total("2026-09-26", 10_000, "ana"), therapistName: "Ana Souza" }],
    );

    expect(row.therapistName).toBe("Ana Souza");
  });

  it("empate no previsto desempata pelo nome", () => {
    const result = summarizeTherapists(
      RANGE,
      [total("2026-09-21", 10_000, "bia"), total("2026-09-21", 10_000, "ana")],
      [],
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

describe("applyExpenses", () => {
  const WEEK = [day("2026-09-21"), day("2026-09-22")];
  // Semana com R$ 100 de bruto na segunda e nada na terça, sem descontos.
  const summary = () => summarizeCashFlow(WEEK, [total("2026-09-21", 10_000)], []);
  const amounts = (grossCents: number, expenseCents: number) => ({
    grossCents,
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
    const month = summarizeCashFlow([{ from: "2026-09-21", to: "2026-09-27" }], [], []);

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

  it("lista os grupos do maior para o menor, com a fatia de cada um no total", () => {
    const result = summarizeCosts([TAXES, RENT]);

    expect(result).toEqual({
      totalCents: 350_000,
      rows: [
        { group: RENT, cents: 300_000, share: 300_000 / 350_000 },
        { group: TAXES, cents: 50_000, share: 50_000 / 350_000 },
      ],
    });
  });

  it("deixa de fora o que ficou em zero", () => {
    const result = summarizeCosts([SUPPLIES, TAXES]);

    expect(result).toEqual({
      totalCents: 50_000,
      rows: [{ group: TAXES, cents: 50_000, share: 1 }],
    });
  });

  it("no empate, os grupos ficam na ordem recebida", () => {
    const a = { id: "a", name: "B", paidCents: 1_000 };
    const b = { id: "b", name: "A", paidCents: 1_000 };
    const result = summarizeCosts([a, b]);

    expect(result.rows.map((row) => row.group.id)).toEqual(["a", "b"]);
  });

  it("sem gasto nenhum, não tem linhas e o total é zero", () => {
    expect(summarizeCosts([SUPPLIES])).toEqual({
      totalCents: 0,
      rows: [],
    });
  });
});

describe("costCurve", () => {
  // Custos de um mês. O bruto fica alto para mostrar que não entra na curva.
  const costs = (expenseCents: number) => ({
    grossCents: 999_999,
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

