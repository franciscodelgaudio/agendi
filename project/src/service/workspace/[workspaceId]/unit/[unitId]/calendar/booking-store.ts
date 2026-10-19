import { isObjectIdOrHexString, Types } from "mongoose"
import { buscarClientePorId } from "@/contextos/clientes/consultas"
import { findUnitProducts } from "@/service/workspace/[workspaceId]/stock/products/product-lookup"
import { findWorkspaceTherapists } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Booking } from "@/models/Booking"
import { Service } from "@/models/Service"
import { TherapistBlock } from "@/models/TherapistBlock"
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
  return room ? { id: room._id.toString(), name: room.name, capacity: room.capacity } : null
}

// Serviços cadastrados antes desses campos não os têm: exigem profissional e aceitam qualquer espaço.
export function serviceRules(service: {
  _id: Types.ObjectId
  name: string
  requiresTherapist?: boolean | null
  treatmentRoomIds?: Types.ObjectId[] | null
  deactivatedAt?: Date | null
}) {
  return {
    id: service._id.toString(),
    name: service.name,
    requiresTherapist: service.requiresTherapist ?? true,
    treatmentRoomIds: (service.treatmentRoomIds ?? []).map((id) => id.toString()),
    ...(service.deactivatedAt && { deactivated: true }),
  }
}

// Buscas usadas por createBooking/updateBooking, restritas à unidade e ao workspace.
// true quando a unidade funciona dentro de um parceiro (tem regra de repasse): o quarto do
// cliente é obrigatório, a não ser para cliente de fora.
export async function isGuestRoomRequired(unitId: string | Types.ObjectId) {
  return (await Unit.exists({ _id: unitId, revenueShare: { $ne: null } })) !== null
}

// Cliente recorrente da empresa, no formato que o agendamento e o atendimento esperam.
export function customerFinder(workspaceId: string) {
  return async (id: string) => {
    const cliente = await buscarClientePorId(workspaceId, id)
    return cliente && { id: cliente.id, name: cliente.nome }
  }
}

export async function bookingLookups(unit: { workspaceId: string; unitId: string }, unitIds: Types.ObjectId[]) {
  return {
    guestRoomRequired: await isGuestRoomRequired(unit.unitId),
    findCustomer: customerFinder(unit.workspaceId),
    findService: async (id: string) => {
      if (!isObjectIdOrHexString(id)) return null
      const service = await Service.findOne({ _id: id, unitId: unit.unitId })
        .select({ name: 1, requiresTherapist: 1, treatmentRoomIds: 1, deactivatedAt: 1 })
        .lean()
      return service && serviceRules(service)
    },
    findTherapist: async (id: string) => (await findWorkspaceTherapists(unit.workspaceId, [id]))[0] ?? null,
    hasConflict: conflictChecker(unitIds),
    isBlocked: blockChecker(unit.workspaceId),
    findTreatmentRoom: (id: string) => findUnitTreatmentRoom(unit.unitId, id),
    findRoomBookings: roomBookingsFinder([unit.unitId]),
    findProducts: (ids: string[]) => findUnitProducts(unit.unitId, ids),
  }
}
