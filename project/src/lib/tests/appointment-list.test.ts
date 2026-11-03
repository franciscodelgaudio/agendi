import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  APPOINTMENT_VIEW,
  calendarPipeline,
  parseCalendarQuery,
  parseCalendarRange,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";

const brt = (path: string) => ({ $dateToString: { date: path, format: "%Y-%m-%dT%H:%M", timezone: "-03:00" } });

describe("APPOINTMENT_VIEW", () => {
  it("traz o cliente (cadastrado pelo id, avulso pelo nome), profissional e estação, com os horários em Brasília", () => {
    expect(APPOINTMENT_VIEW).toEqual([
      {
        $lookup: {
          from: "customers",
          localField: "customer.customerId",
          foreignField: "_id",
          as: "registeredCustomer",
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
          customer: {
            $cond: [
              { $eq: ["$customer.kind", "registered"] },
              { kind: "registered", customerId: { $toString: "$customer.customerId" } },
              { $ifNull: ["$customer", null] },
            ],
          },
          customerName: { $ifNull: [{ $first: "$registeredCustomer.name" }, "$customer.name", null] },
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
                    in: { $concat: ["$$this.type", " ", { $toString: "$$this.number" }] },
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

describe("parseCalendarQuery", () => {
  const THURSDAY = "2026-11-05";

  it("sem parâmetros, mostra a semana de hoje, de domingo a domingo, sem filtros", () => {
    expect(parseCalendarQuery({}, THURSDAY)).toEqual({
      view: "timeGridWeek",
      start: "2026-11-01",
      end: "2026-11-08",
      unit: "",
      member: "",
    });
  });

  it("num domingo, a semana começa no próprio dia", () => {
    expect(parseCalendarQuery({}, "2026-11-01")).toMatchObject({ start: "2026-11-01", end: "2026-11-08" });
  });

  it("na visão de dia sem período, mostra só hoje, virando o mês", () => {
    expect(parseCalendarQuery({ view: "timeGridDay" }, "2026-11-30")).toMatchObject({
      view: "timeGridDay",
      start: "2026-11-30",
      end: "2026-12-01",
    });
  });

  it("na visão de mês sem período, mostra as 6 semanas do mês de hoje, começando no domingo antes do dia 1", () => {
    expect(parseCalendarQuery({ view: "dayGridMonth" }, "2026-12-15")).toMatchObject({
      view: "dayGridMonth",
      start: "2026-11-29",
      end: "2027-01-10",
    });
  });

  it("usa a visão, o período e os filtros válidos da URL", () => {
    expect(
      parseCalendarQuery(
        { view: "dayGridMonth", start: "2026-09-27", end: "2026-11-08", unit: [UNIT_ID, "x"], member: ANA_ID },
        THURSDAY,
      ),
    ).toEqual({ view: "dayGridMonth", start: "2026-09-27", end: "2026-11-08", unit: UNIT_ID, member: ANA_ID });
  });

  it.each([
    ["fim antes do início", { start: "2026-09-28", end: "2026-09-21" }],
    ["mais de 42 dias", { start: "2026-09-01", end: "2026-10-14" }],
    ["dia inválido", { start: "2026-02-30", end: "2026-03-02" }],
    ["só o início", { start: "2026-09-21" }],
  ])("com %s, volta para a semana de hoje", (_label, params) => {
    expect(parseCalendarQuery(params, THURSDAY)).toMatchObject({ start: "2026-11-01", end: "2026-11-08" });
  });

  it("visão desconhecida vira a de semana, e filtros que não são ids são ignorados", () => {
    expect(parseCalendarQuery({ view: "listWeek", unit: "x", member: "1" }, THURSDAY)).toEqual({
      view: "timeGridWeek",
      start: "2026-11-01",
      end: "2026-11-08",
      unit: "",
      member: "",
    });
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
