import { isObjectIdOrHexString, Types } from "mongoose"
import { findWorkspaceTherapists } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Appointment } from "@/models/Appointment"
import { Customer } from "@/models/Customer"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

const ACTIVE = { $ne: "cancelled" as const }

export function conflictChecker(workspaceId: string) {
  return async ({
    workspaceMemberId,
    startsAt,
    endsAt,
    excludeId,
  }: {
    workspaceMemberId: string
    startsAt: Date
    endsAt: Date
    excludeId?: string
  }) => {
    if (!isObjectIdOrHexString(workspaceMemberId)) return false
    const conflict = await Appointment.exists({
      workspaceId,
      workspaceMemberId,
      status: ACTIVE,
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
    return conflict !== null
  }
}

export function stationAppointmentsFinder(unitId: string | Types.ObjectId) {
  return async ({
    stationId,
    startsAt,
    endsAt,
    excludeId,
  }: {
    stationId: string
    startsAt: Date
    endsAt: Date
    excludeId?: string
  }) => {
    if (!isObjectIdOrHexString(stationId)) return []
    return Appointment.find({
      unitId,
      stationId,
      status: ACTIVE,
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
      .select({ _id: 0, startsAt: 1, endsAt: 1 })
      .lean()
  }
}

export async function findUnitStation(unitId: string | Types.ObjectId, stationId: string) {
  if (!isObjectIdOrHexString(stationId)) return null
  const unit = await Unit.findOne({ _id: unitId, "stations._id": stationId }).select({ "stations.$": 1 }).lean()
  const station = unit?.stations[0]
  return station ? { id: station._id.toString(), name: station.name, active: station.active } : null
}

export function appointmentLookups(unit: { workspaceId: string; unitId: string }) {
  return {
    findService: async (id: string) => {
      if (!isObjectIdOrHexString(id)) return null
      const service = await Service.findOne({ _id: id, workspaceId: unit.workspaceId })
        .select({ name: 1, durationMinutes: 1, priceCents: 1 })
        .lean()
      return service && { id: service._id.toString(), name: service.name, durationMinutes: service.durationMinutes }
    },
    findCustomer: async (id: string) => {
      if (!isObjectIdOrHexString(id)) return null
      const customer = await Customer.findOne({ _id: id, workspaceId: unit.workspaceId }).select({ _id: 1 }).lean()
      return customer && { id: customer._id.toString() }
    },
    findMember: async (id: string) => (await findWorkspaceTherapists(unit.workspaceId, [id], unit.unitId))[0] ?? null,
    findStation: (id: string) => findUnitStation(unit.unitId, id),
    hasConflict: conflictChecker(unit.workspaceId),
    findStationAppointments: stationAppointmentsFinder(unit.unitId),
  }
}
