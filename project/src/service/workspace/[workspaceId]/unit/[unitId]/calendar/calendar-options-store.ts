import { Types } from "mongoose"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Appointment } from "@/models/Appointment"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"
import { Workspace } from "@/models/Workspace"

export type CalendarOptionsData = {
  units: { id: string; name: string }[]
  services: { id: string; unitId: string; name: string; durationMinutes: number; priceCents: number }[]
  stations: { id: string; unitId: string; name: string }[]
  therapists: { id: string; name: string; image: string | null; unitIds?: string[] }[]
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
        name: station.name,
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
    { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
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
        customerName: { $ifNull: [{ $first: "$customer.name" }, "Cliente excluído"] },
        serviceName: "$name",
        therapistId: { $toString: "$workspaceMemberId" },
        therapistName: { $ifNull: [{ $first: "$member.name" }, null] },
        attended: { $eq: ["$status", "done"] },
      },
    },
  ])
}
