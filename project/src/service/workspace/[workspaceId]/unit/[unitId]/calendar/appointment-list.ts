import { Types, type PipelineStage } from "mongoose";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { accentInsensitivePattern } from "@/service/workspace/[workspaceId]/users/user-list";
import {
  APPOINTMENT_STATUSES,
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
  customerId: string;
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

export const APPOINTMENT_VIEW: PipelineStage.FacetPipelineStage[] = [
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

function rangeMatch({ start, end }: CalendarRange) {
  return { startsAt: { $lt: dayStart(end) }, endsAt: { $gt: dayStart(start) } };
}

export function calendarPipeline(range: CalendarRange): PipelineStage.FacetPipelineStage[] {
  const match: Record<string, unknown> = { status: { $ne: "cancelled" }, ...rangeMatch(range) };
  if (range.unit) match.unitId = new Types.ObjectId(range.unit);
  if (range.member) match.workspaceMemberId = new Types.ObjectId(range.member);
  return [{ $match: match }, { $sort: { startsAt: 1, _id: 1 } }, ...APPOINTMENT_VIEW];
}

export const APPOINTMENT_PAGE_SIZE = 20;
const SORT_FIELDS = { startsAt: "startsAt", customer: "customerName", name: "name" } as const;

export type AppointmentSortField = keyof typeof SORT_FIELDS;
export type AppointmentListQuery = {
  q: string;
  sort: AppointmentSortField;
  dir: SortDir;
  unit: string;
  member: string;
  status: AppointmentStatus | "";
  from: string;
  to: string;
  page: number;
};
export type AppointmentPage = { rows: AppointmentRow[]; total: number };

function isSortField(value: string | undefined): value is AppointmentSortField {
  return value !== undefined && Object.hasOwn(SORT_FIELDS, value);
}

function dayOrEmpty(value: string | undefined) {
  return value && parseDay(value) ? value : "";
}

export function parseAppointmentListQuery(params: SearchParams): AppointmentListQuery {
  const sort = first(params.sort);
  const status = first(params.status);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: isSortField(sort) ? sort : "startsAt",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    unit: objectIdOrEmpty(first(params.unit)),
    member: objectIdOrEmpty(first(params.member)),
    status: APPOINTMENT_STATUSES.includes(status as AppointmentStatus) ? (status as AppointmentStatus) : "",
    from: dayOrEmpty(first(params.from)),
    to: dayOrEmpty(first(params.to)),
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

export function appointmentListPipeline({
  q,
  sort,
  dir,
  unit,
  member,
  status,
  from,
  to,
  page,
}: AppointmentListQuery): PipelineStage[] {
  const match: Record<string, unknown> = {};
  if (from || to) {
    const startsAt: Record<string, Date> = {};
    if (from) startsAt.$gte = dayStart(from)!;
    if (to) startsAt.$lt = new Date(dayStart(to)!.getTime() + DAY_MS);
    match.startsAt = startsAt;
  }
  if (unit) match.unitId = new Types.ObjectId(unit);
  if (member) match.workspaceMemberId = new Types.ObjectId(member);
  if (status) match.status = status;

  const stages: PipelineStage[] = [];
  if (Object.keys(match).length) stages.push({ $match: match });
  stages.push(...APPOINTMENT_VIEW);
  if (q) {
    const regex = { $regex: accentInsensitivePattern(q), $options: "i" };
    stages.push({ $match: { $or: [{ customerName: regex }, { name: regex }, { memberName: regex }] } });
  }
  stages.push(
    { $sort: { [SORT_FIELDS[sort]]: dir === "desc" ? -1 : 1, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * APPOINTMENT_PAGE_SIZE }, { $limit: APPOINTMENT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  );
  return stages;
}
