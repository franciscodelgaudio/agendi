import { Types } from "mongoose"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import {
  blockedCalendarPipeline,
  calendarPipeline,
  parseCalendarQuery,
  type AppointmentBlockedRow,
  type AppointmentRow,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { stationName } from "@/service/workspace/[workspaceId]/unit/[unitId]/station"
import type { SearchParams } from "@/service/workspace/[workspaceId]/unit/unit-list"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { Appointment, AppointmentBlocked } from "@/models/Appointment"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"
import { Workspace } from "@/models/Workspace"

export type CalendarOptionsData = {
  units: { id: string; name: string }[]
  services: { id: string; unitId: string; name: string; durationMinutes: number; priceCents: number }[]
  stations: { id: string; unitId: string; name: string }[]
  therapists: { id: string; name: string; image: string | null; unitIds?: string[] }[]
}

const HOUR_MS = 60 * 60 * 1000

export async function loadCalendarAppointments(workspaceId: string, params: SearchParams, unitId?: string) {
  const today = new Date(Date.now() - BRT_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10)
  const query = parseCalendarQuery(unitId ? { ...params, unit: unitId } : params, today)
  const workspaceMatch = { $match: { workspaceId: new Types.ObjectId(workspaceId) } }
  const [appointments, blocked] = await Promise.all([
    Appointment.aggregate<AppointmentRow>([workspaceMatch, ...calendarPipeline(query)]),
    AppointmentBlocked.aggregate<AppointmentBlockedRow>([workspaceMatch, ...blockedCalendarPipeline(query)]),
  ])
  return { query, appointments, blocked }
}

export async function loadCalendarOptions(workspaceId: string, unitId?: string): Promise<CalendarOptionsData> {
  const workspace = new Types.ObjectId(workspaceId)
  const [units, services, [therapistDoc]] = await Promise.all([
    Unit.find({ workspaceId: workspace, ...(unitId && { _id: new Types.ObjectId(unitId) }) })
      .select({ name: 1, stations: 1 })
      .sort({ name: 1, _id: 1 })
      .lean(),
    Service.find({ workspaceId: workspace, ...(unitId && { unitId: new Types.ObjectId(unitId) }) })
      .select({ unitId: 1, name: 1, durationMinutes: 1, priceCents: 1 })
      .sort({ name: 1, _id: 1 })
      .lean(),
    Workspace.aggregate<{ therapists: CalendarOptionsData["therapists"] }>([
      { $match: { _id: workspace } },
      ...therapistOptionsStages(unitId),
      { $project: { _id: 0, therapists: 1 } },
    ]),
  ])
  return {
    units: units.map((unit) => ({ id: unit._id.toString(), name: unit.name })),
    services: services.map((service) => ({
      id: service._id.toString(),
      unitId: service.unitId.toString(),
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
    })),
    stations: units.flatMap((unit) =>
      unit.stations.map((station) => ({
        id: station._id.toString(),
        unitId: unit._id.toString(),
        name: stationName(station),
      })),
    ),
    therapists: therapistDoc?.therapists ?? [],
  }
}

export type DayAppointment = {
  id: string
  unitId: string
  startsAt: Date
  endsAt: Date
  customerName: string
  serviceName: string
  therapistId: string | null
  therapistName: string | null
  attended: boolean
}

export async function loadDayAppointments(unitIds: Types.ObjectId[], start: Date, end: Date): Promise<DayAppointment[]> {
  return Appointment.aggregate<DayAppointment>([
    { $match: { unitId: { $in: unitIds }, status: { $ne: "cancelled" }, startsAt: { $gte: start, $lt: end } } },
    { $sort: { startsAt: 1, _id: 1 } },
    { $lookup: { from: "customers", localField: "customer.customerId", foreignField: "_id", as: "registeredCustomer" } },
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
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        unitId: { $toString: "$unitId" },
        startsAt: 1,
        endsAt: 1,
        customerName: { $ifNull: [{ $first: "$registeredCustomer.name" }, "$customer.name", "Sem cliente"] },
        serviceName: "$name",
        therapistId: { $toString: "$workspaceMemberId" },
        therapistName: { $ifNull: [{ $first: "$member.name" }, null] },
        attended: { $eq: ["$status", "done"] },
      },
    },
  ])
}
