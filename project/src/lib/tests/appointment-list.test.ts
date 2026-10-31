import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  APPOINTMENT_PAGE_SIZE,
  APPOINTMENT_VIEW,
  appointmentListPipeline,
  calendarPipeline,
  parseAppointmentListQuery,
  parseCalendarRange,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";

const brt = (path: string) => ({ $dateToString: { date: path, format: "%Y-%m-%dT%H:%M", timezone: "-03:00" } });

describe("APPOINTMENT_VIEW", () => {
  it("traz cliente, profissional e estação pelos ids, com os horários em Brasília", () => {
    expect(APPOINTMENT_VIEW).toEqual([
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
          pipeline: [{ $project: { _id: 0, name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "workspace_members",
          localField: "workspaceMemberId",
          foreignField: "_id",
          as: "member",
          pipeline: [
            { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
            { $project: { _id: 0, name: { $ifNull: [{ $first: "$user.name" }, { $first: "$user.email" }] } } },
          ],
        },
      },
      {
        $lookup: {
          from: "units",
          localField: "unitId",
          foreignField: "_id",
          as: "unit",
          pipeline: [{ $project: { _id: 0, stations: 1 } }],
        },
      },
      {
        $project: {
          _id: 0,
          id: { $toString: "$_id" },
          unitId: { $toString: "$unitId" },
          serviceId: { $toString: "$serviceId" },
          customerId: { $toString: "$customerId" },
          customerName: { $ifNull: [{ $first: "$customer.name" }, null] },
          workspaceMemberId: { $toString: "$workspaceMemberId" },
          memberName: { $ifNull: [{ $first: "$member.name" }, null] },
          stationId: { $toString: "$stationId" },
          stationName: {
            $ifNull: [
              {
                $first: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: [{ $first: "$unit.stations" }, []] },
                        cond: { $eq: ["$$this._id", "$stationId"] },
                      },
                    },
                    in: "$$this.name",
                  },
                },
              },
              null,
            ],
          },
          name: 1,
          status: 1,
          startsAt: brt("$startsAt"),
          endsAt: brt("$endsAt"),
          durationMinutes: 1,
          color: { $ifNull: ["$color", null] },
        },
      },
    ]);
  });
});

describe("parseCalendarRange", () => {
  it("lê o intervalo de dias e os filtros de unidade e profissional", () => {
    expect(parseCalendarRange({ start: "2026-09-21", end: "2026-09-28", unit: UNIT_ID, member: ANA_ID })).toEqual({
      start: "2026-09-21",
      end: "2026-09-28",
      unit: UNIT_ID,
      member: ANA_ID,
    });
  });

  it("ignora filtros que não são ids", () => {
    expect(parseCalendarRange({ start: "2026-09-21", end: "2026-09-28", unit: "x", member: 1 })).toEqual({
      start: "2026-09-21",
      end: "2026-09-28",
      unit: "",
      member: "",
    });
  });

  it.each([
    ["fim antes do início", { start: "2026-09-28", end: "2026-09-21" }],
    ["mais de 42 dias", { start: "2026-09-01", end: "2026-10-14" }],
    ["dia inválido", { start: "2026-02-30", end: "2026-03-02" }],
    ["sem dias", {}],
  ])("recusa %s", (_label, input) => {
    expect(parseCalendarRange(input)).toBeNull();
  });
});

describe("calendarPipeline", () => {
  it("traz os agendamentos não cancelados que cruzam o intervalo, da unidade e profissional filtradas", () => {
    expect(calendarPipeline({ start: "2026-09-21", end: "2026-09-28", unit: UNIT_ID, member: ANA_ID })).toEqual([
      {
        $match: {
          status: { $ne: "cancelled" },
          startsAt: { $lt: new Date("2026-09-28T03:00:00.000Z") },
          endsAt: { $gt: new Date("2026-09-21T03:00:00.000Z") },
          unitId: new Types.ObjectId(UNIT_ID),
          workspaceMemberId: new Types.ObjectId(ANA_ID),
        },
      },
      { $sort: { startsAt: 1, _id: 1 } },
      ...APPOINTMENT_VIEW,
    ]);
  });
});

const BASE = { q: "", sort: "startsAt", dir: "desc", unit: "", member: "", status: "", from: "", to: "", page: 1 } as const;

describe("parseAppointmentListQuery", () => {
  it("sem parâmetros, mostra todos do mais recente para o mais antigo na página 1", () => {
    expect(parseAppointmentListQuery({})).toEqual(BASE);
  });

  it("lê busca, filtros, período, ordenação e página válidos", () => {
    expect(
      parseAppointmentListQuery({
        q: " joão ",
        sort: "customer",
        dir: "asc",
        unit: UNIT_ID,
        member: ANA_ID,
        status: "done",
        from: "2026-09-01",
        to: "2026-09-30",
        page: "2",
      }),
    ).toEqual({
      q: "joão",
      sort: "customer",
      dir: "asc",
      unit: UNIT_ID,
      member: ANA_ID,
      status: "done",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 2,
    });
  });

  it("ignora valores inválidos", () => {
    expect(
      parseAppointmentListQuery({ sort: "price", unit: "x", member: "y", status: "pending", from: "2026-02-30", page: "0" }),
    ).toEqual(BASE);
  });
});

describe("appointmentListPipeline", () => {
  const paged = (sort: Record<string, number>, skip: number) => [
    { $sort: { ...sort, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: APPOINTMENT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("sem filtros, monta a visão e ordena pelo início mais recente", () => {
    expect(appointmentListPipeline(BASE)).toEqual([...APPOINTMENT_VIEW, ...paged({ startsAt: -1 }, 0)]);
  });

  it("filtra unidade, profissional, status e período em Brasília antes de montar a visão", () => {
    const stages = appointmentListPipeline({
      ...BASE,
      unit: UNIT_ID,
      member: ANA_ID,
      status: "scheduled",
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(stages[0]).toEqual({
      $match: {
        startsAt: { $gte: new Date("2026-09-01T03:00:00.000Z"), $lt: new Date("2026-10-01T03:00:00.000Z") },
        unitId: new Types.ObjectId(UNIT_ID),
        workspaceMemberId: new Types.ObjectId(ANA_ID),
        status: "scheduled",
      },
    });
    expect(stages.slice(1, 1 + APPOINTMENT_VIEW.length)).toEqual(APPOINTMENT_VIEW);
  });

  it("busca no cliente, no serviço e na profissional sem diferenciar acentos, e ordena pelo cliente", () => {
    const stages = appointmentListPipeline({ ...BASE, q: "joao", sort: "customer", dir: "asc", page: 3 });
    const search = stages[APPOINTMENT_VIEW.length] as {
      $match: { $or: { [field: string]: { $regex: string; $options: string } }[] };
    };

    expect(search.$match.$or.map((condition) => Object.keys(condition)[0])).toEqual(["customerName", "name", "memberName"]);
    const { $regex, $options } = search.$match.$or[0].customerName;
    expect(new RegExp($regex, $options).test("João Silva")).toBe(true);
    expect(stages.slice(APPOINTMENT_VIEW.length + 1)).toEqual(paged({ customerName: 1 }, 2 * APPOINTMENT_PAGE_SIZE));
  });
});
