import { isObjectIdOrHexString, Types } from "mongoose"
import { findUnitProducts } from "@/service/workspace/[workspaceId]/stock/products/product-lookup"
import { findWorkspaceTherapists } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Booking } from "@/models/Booking"
import { Service } from "@/models/Service"
import { TherapistBlock } from "@/models/TherapistBlock"
import { Unit } from "@/models/Unit"

// Buscas no banco usadas por lib/booking, compartilhadas pelas server actions.

// Conflito do profissional em qualquer unidade do workspace.
export function conflictChecker(unitIds: Types.ObjectId[]) {
  return async ({
    therapistId,
    startsAt,
    endsAt,
    excludeId,
  }: {
    therapistId: string
    startsAt: Date
    endsAt: Date
    excludeId?: string
  }) => {
    const conflict = await Booking.exists({
      therapistId,
      unitId: { $in: unitIds },
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
    return conflict !== null
  }
}

// Agenda do profissional travada em algum momento do intervalo, no workspace.
export function blockChecker(workspaceId: string) {
  return async ({ therapistId, startsAt, endsAt }: { therapistId: string; startsAt: Date; endsAt: Date }) => {
    const block = await TherapistBlock.exists({
      workspaceId,
      therapistId,
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    })
    return block !== null
  }
}

// Outros agendamentos da estação que se sobrepõem ao intervalo, nas unidades dadas.
export function stationBookingsFinder(unitIds: (Types.ObjectId | string)[]) {
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
    return Booking.find({
      "station.stationId": stationId,
      unitId: { $in: unitIds },
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
      .select({ _id: 0, startsAt: 1, endsAt: 1 })
      .lean()
  }
}

// Estação da unidade, ou null se não existe nela.
export async function findUnitStation(unitId: string | Types.ObjectId, stationId: string) {
  if (!isObjectIdOrHexString(stationId)) return null
  const unit = await Unit.findOne({ _id: unitId, "stations._id": stationId }).select({ "stations.$": 1 }).lean()
  const station = unit?.stations[0]
  return station ? { id: station._id.toString(), name: station.name, active: station.active } : null
}

// Serviços cadastrados antes desses campos não os têm: exigem profissional e aceitam qualquer estação.
export function serviceRules(service: {
  _id: Types.ObjectId
  name: string
  requiresTherapist?: boolean | null
  stationIds?: Types.ObjectId[] | null
}) {
  return {
    id: service._id.toString(),
    name: service.name,
    requiresTherapist: service.requiresTherapist ?? true,
    stationIds: (service.stationIds ?? []).map((id) => id.toString()),
  }
}

// Buscas usadas por createBooking/updateBooking, restritas à unidade e ao workspace.
export function bookingLookups(unit: { workspaceId: string; unitId: string }, unitIds: Types.ObjectId[]) {
  return {
    findService: async (id: string) => {
      if (!isObjectIdOrHexString(id)) return null
      const service = await Service.findOne({ _id: id, unitId: unit.unitId })
        .select({ name: 1, requiresTherapist: 1, stationIds: 1 })
        .lean()
      return service && serviceRules(service)
    },
    findTherapist: async (id: string) =>
      (await findWorkspaceTherapists(unit.workspaceId, [id], unit.unitId))[0] ?? null,
    hasConflict: conflictChecker(unitIds),
    isBlocked: blockChecker(unit.workspaceId),
    findStation: (id: string) => findUnitStation(unit.unitId, id),
    findStationBookings: stationBookingsFinder([unit.unitId]),
    findProducts: (ids: string[]) => findUnitProducts(unit.unitId, ids),
  }
}
