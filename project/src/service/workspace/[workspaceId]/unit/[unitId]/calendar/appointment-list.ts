import { Types, type PipelineStage } from "mongoose";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { first, type SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list";
import {
  type AppointmentCustomer,
  type AppointmentStatus,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 42;
const BRT_TIMEZONE = `-${String(BRT_OFFSET_HOURS).padStart(2, "0")}:00`;

export type CalendarRange = { start: string; end: string; unit: string; member: string };

export type AppointmentRow = {
  id: string;
  unitId: string;
  serviceId: string;
  customer: AppointmentCustomer | null;
  customerName: string | null;
  workspaceMemberId: string;
  memberName: string | null;
  stationId: string;
  stationName: string | null;
  name: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  color: string | null;
};

export type AppointmentBlockedRow = {
  id: string;
  unitId: string | null;
  workspaceMemberId: string;
  memberName: string | null;
  reason: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

function objectIdOrEmpty(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? value : "";
}

function dayStart(value: unknown) {
  const day = typeof value === "string" && parseDay(value);
  if (!day) return null;
  const [year, month, date] = day;
  return new Date(Date.UTC(year, month - 1, date, BRT_OFFSET_HOURS));
}

function brtDateTime(path: string) {
  return { $dateToString: { date: path, format: "%Y-%m-%dT%H:%M", timezone: BRT_TIMEZONE } };
}

const MEMBER_LOOKUP: PipelineStage.FacetPipelineStage = {
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
};

export const APPOINTMENT_VIEW: PipelineStage.FacetPipelineStage[] = [
  {
    $lookup: {
      from: "customers",
      localField: "customer.customerId",
      foreignField: "_id",
      as: "registeredCustomer",
      pipeline: [{ $project: { _id: 0, name: 1 } }],
    },
  },
  MEMBER_LOOKUP,
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
      startsAt: brtDateTime("$startsAt"),
      endsAt: brtDateTime("$endsAt"),
      durationMinutes: 1,
      color: { $ifNull: ["$color", null] },
    },
  },
];

export function parseCalendarRange(input: unknown): CalendarRange | null {
  const { start, end, unit, member } = (input ?? {}) as Record<string, unknown>;
  const startDate = dayStart(start);
  const endDate = dayStart(end);
  if (!startDate || !endDate) return null;
  const days = (endDate.getTime() - startDate.getTime()) / DAY_MS;
  if (days <= 0 || days > MAX_RANGE_DAYS) return null;
  return { start: start as string, end: end as string, unit: objectIdOrEmpty(unit), member: objectIdOrEmpty(member) };
}

export const CALENDAR_VIEWS = ["timeGridDay", "timeGridWeek", "dayGridMonth"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export type CalendarQuery = CalendarRange & { view: CalendarView };

function shiftDay(day: string, days: number) {
  const [year, month, date] = parseDay(day)!;
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

function defaultRange(view: CalendarView, today: string) {
  if (view === "timeGridDay") return { start: today, end: shiftDay(today, 1) };
  const anchor = view === "dayGridMonth" ? `${today.slice(0, 8)}01` : today;
  const start = shiftDay(anchor, -new Date(`${anchor}T00:00:00Z`).getUTCDay());
  return { start, end: shiftDay(start, view === "dayGridMonth" ? MAX_RANGE_DAYS : 7) };
}

export function parseCalendarQuery(params: SearchParams, today: string): CalendarQuery {
  const requested = first(params.view);
  const view = CALENDAR_VIEWS.includes(requested as CalendarView) ? (requested as CalendarView) : "timeGridWeek";
  const filters = { unit: first(params.unit), member: first(params.member) };
  const range =
    parseCalendarRange({ start: first(params.start), end: first(params.end), ...filters }) ??
    parseCalendarRange({ ...defaultRange(view, today), ...filters })!;
  return { view, ...range };
}

function rangeMatch({ start, end }: CalendarRange) {
  return { startsAt: { $lt: dayStart(end) }, endsAt: { $gt: dayStart(start) } };
}

export function calendarPipeline(range: CalendarRange): PipelineStage.FacetPipelineStage[] {
  const match: Record<string, unknown> = { status: { $ne: "cancelled" }, ...rangeMatch(range) };
  if (range.unit) match.unitId = new Types.ObjectId(range.unit);
  if (range.member) match.workspaceMemberId = new Types.ObjectId(range.member);
  return [{ $match: match }, { $sort: { startsAt: 1, _id: 1 } }, ...APPOINTMENT_VIEW];
}

export function blockedCalendarPipeline(range: CalendarRange): PipelineStage.FacetPipelineStage[] {
  const match: Record<string, unknown> = rangeMatch(range);
  if (range.unit) match.unitId = { $in: [new Types.ObjectId(range.unit), null] };
  if (range.member) match.workspaceMemberId = new Types.ObjectId(range.member);
  return [
    { $match: match },
    { $sort: { startsAt: 1, _id: 1 } },
    MEMBER_LOOKUP,
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        unitId: { $cond: [{ $eq: [{ $ifNull: ["$unitId", null] }, null] }, null, { $toString: "$unitId" }] },
        workspaceMemberId: { $toString: "$workspaceMemberId" },
        memberName: { $ifNull: [{ $first: "$member.name" }, null] },
        reason: { $ifNull: ["$reason", null] },
        startsAt: brtDateTime("$startsAt"),
        endsAt: brtDateTime("$endsAt"),
        durationMinutes: 1,
      },
    },
  ];
}
