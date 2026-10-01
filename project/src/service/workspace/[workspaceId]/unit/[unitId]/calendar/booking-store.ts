import { isObjectIdOrHexString, Types } from "mongoose"
import { findUnitProducts } from "@/service/workspace/[workspaceId]/stock/products/product-lookup"
import { findWorkspaceTherapists } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Booking } from "@/models/Booking"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

// Buscas no banco usadas por lib/booking, compartilhadas pelas server actions e pela URA.

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

// Outros agendamentos da sala que se sobrepõem ao intervalo, nas unidades dadas.
export function roomBookingsFinder(unitIds: (Types.ObjectId | string)[]) {
  return async ({
    treatmentRoomId,
    startsAt,
    endsAt,
    excludeId,
  }: {
    treatmentRoomId: string
    startsAt: Date
    endsAt: Date
    excludeId?: string
  }) => {
    if (!isObjectIdOrHexString(treatmentRoomId)) return []
    return Booking.find({
      "treatmentRoom.roomId": treatmentRoomId,
      unitId: { $in: unitIds },
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
      .select({ _id: 0, startsAt: 1, endsAt: 1 })
      .lean()
  }
}

// Sala da unidade, ou null se não existe nela.
export async function findUnitTreatmentRoom(unitId: string | Types.ObjectId, roomId: string) {
  if (!isObjectIdOrHexString(roomId)) return null
  const unit = await Unit.findOne({ _id: unitId, "treatmentRooms._id": roomId })
    .select({ "treatmentRooms.$": 1 })
    .lean()
  const room = unit?.treatmentRooms[0]
  return room ? { id: room._id.toString(), name: room.name, beds: room.beds } : null
}

// Buscas usadas por createBooking/updateBooking, restritas à unidade e ao workspace.
export function bookingLookups(unit: { workspaceId: string; unitId: string }, unitIds: Types.ObjectId[]) {
  return {
    findService: async (id: string) => {
      if (!isObjectIdOrHexString(id)) return null
      const service = await Service.findOne({ _id: id, unitId: unit.unitId }).select({ name: 1 }).lean()
      return service && { id: service._id.toString(), name: service.name }
    },
    findTherapist: async (id: string) => (await findWorkspaceTherapists(unit.workspaceId, [id]))[0] ?? null,
    hasConflict: conflictChecker(unitIds),
    findTreatmentRoom: (id: string) => findUnitTreatmentRoom(unit.unitId, id),
    findRoomBookings: roomBookingsFinder([unit.unitId]),
    findProducts: (ids: string[]) => findUnitProducts(unit.unitId, ids),
  }
}
