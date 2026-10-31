import { describe, it, expect } from "vitest";
import {
  cashFlowBuckets,
  dailyAppointmentTotalsPipeline,
  dailyBookingForecastPipeline,
  parseCashFlowQuery,
  serviceAppointmentTotalsPipeline,
  serviceBookingForecastPipeline,
  summarizeCashFlow,
  summarizeServices,
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
