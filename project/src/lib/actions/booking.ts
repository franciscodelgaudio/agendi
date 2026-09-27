"use server"

import { isObjectIdOrHexString, Types } from "mongoose"
import { canManageMembers } from "@/lib/member"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceTherapists } from "@/lib/therapist-lookup"
import { findUnitProducts } from "@/lib/product-lookup"
import { findManagedUnit } from "@/lib/unit-access"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import {
  createBooking,
  deleteBooking,
  rescheduleBooking,
  updateBooking,
  type BookingError,
} from "@/lib/booking"
import { Booking } from "@/models/Booking"
import { Unit } from "@/models/Unit"
import { Service } from "@/models/Service"

const errorMessages: Record<BookingError | "unauthenticated", string> = {
  invalid_input: "Preencha massagista, sala, hóspede, quarto, início e duração.",
  invalid_therapist: "Escolha a massagista.",
  invalid_service: "Escolha o serviço.",
  invalid_treatment_room: "Escolha a sala.",
  invalid_guest_name: "Informe o nome do hóspede.",
  guest_name_too_long: "O nome do hóspede pode ter no máximo 80 caracteres.",
  invalid_room: "Informe o quarto.",
  room_too_long: "O quarto pode ter no máximo 20 caracteres.",
  invalid_starts_at: "Informe uma data e hora válidas.",
  invalid_duration: "O agendamento precisa durar entre 5 minutos e 12 horas.",
  invalid_color: "Escolha uma cor da lista.",
  service_not_found: "O serviço escolhido não é desta unidade. Recarregue a página.",
  therapist_not_found: "A massagista escolhida não pode atender neste workspace. Recarregue a página.",
  therapist_busy: "A massagista já tem um agendamento nesse horário.",
  treatment_room_not_found: "A sala escolhida não é desta unidade. Recarregue a página.",
  room_full: "A sala já está ocupada nesse horário.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  booking_not_found: "Agendamento não encontrado ou sem permissão.",
  too_many_products: "Escolha no máximo 20 produtos.",
  product_not_found: "Algum produto não foi encontrado nesta unidade. Recarregue a página.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type BookingActionState = { error: string | null }

function bookingInput(formData: FormData) {
  return {
    therapistId: formData.get("therapistId"),
    guestName: formData.get("guestName"),
    room: formData.get("room"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes"),
    serviceId: formData.get("serviceId"),
    treatmentRoomId: formData.get("treatmentRoomId"),
    productIds: formData.getAll("productId"),
    color: formData.get("color"),
  }
}

// Unidades do workspace, se o usuário o gerencia (dono ou administrador); senão null.
async function findManagedUnitIds(workspaceId: string, userId: string) {
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access || !canManageMembers(access.role)) return null
  return Unit.find({ workspaceId: access.id }).distinct("_id")
}

// Conflito da massagista em qualquer unidade do workspace.
function conflictChecker(unitIds: Types.ObjectId[]) {
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
function roomBookingsFinder(unitIds: (Types.ObjectId | string)[]) {
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
async function findUnitTreatmentRoom(unitId: string | Types.ObjectId, roomId: string) {
  if (!isObjectIdOrHexString(roomId)) return null
  const unit = await Unit.findOne({ _id: unitId, "treatmentRooms._id": roomId })
    .select({ "treatmentRooms.$": 1 })
    .lean()
  const room = unit?.treatmentRooms[0]
  return room ? { id: room._id.toString(), name: room.name, beds: room.beds } : null
}

// Buscas usadas por createBooking/updateBooking, restritas à unidade e ao workspace.
function bookingLookups(unit: { workspaceId: string; unitId: string }, unitIds: Types.ObjectId[]) {
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

// workspaceId vem via argumento e a unidade pelo formulário (campo unitId); a posse é conferida aqui.
export async function createBookingAction(
  workspaceId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const unitId = formData.get("unitId")
  const unit = await findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId)
  const unitIds = unit ? await Unit.find({ workspaceId: unit.workspaceId }).distinct("_id") : []

  const result = await createBooking(bookingInput(formData), unit?.unitId, {
    ...bookingLookups(unit!, unitIds),
    insert: async (data) => {
      const booking = await Booking.create({ ...data, createdBy: userId })
      return { id: booking._id.toString() }
    },
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}

// Permite mover o agendamento para outra unidade: ele precisa ser de alguma unidade do
// workspace, e a nova unidade precisa ser gerenciável.
export async function updateBookingAction(
  workspaceId: string,
  bookingId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const unitId = formData.get("unitId")
  const unit = await findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId)
  if (!unit) return { error: errorMessages.unit_not_found }
  const unitIds = await Unit.find({ workspaceId: unit.workspaceId }).distinct("_id")

  const result = await updateBooking(bookingInput(formData), isObjectIdOrHexString(bookingId) ? bookingId : null, {
    ...bookingLookups(unit, unitIds),
    update: async (id, fields) => {
      // Agendamento que já virou atendimento não é mais editável.
      const { matchedCount } = await Booking.updateOne(
        { _id: id, unitId: { $in: unitIds }, appointmentId: null },
        { $set: { ...fields, unitId: unit.unitId } },
      )
      return matchedCount > 0
    },
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}

// Arrastar ou redimensionar no calendário.
export async function rescheduleBookingAction(
  workspaceId: string,
  bookingId: string,
  times: { startsAt: string; endsAt: string },
): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const unitIds = await findManagedUnitIds(workspaceId, userId)

  // Só repassa o id quando o workspace é gerenciável; a escrita ainda filtra pelas unidades dele.
  const result = await rescheduleBooking(times, unitIds && isObjectIdOrHexString(bookingId) ? bookingId : null, {
    findBooking: async (id) => {
      // Agendamento que já virou atendimento não pode ser arrastado.
      const booking = await Booking.findOne({ _id: id, unitId: { $in: unitIds! }, appointmentId: null })
        .select({ therapistId: 1, unitId: 1, treatmentRoom: 1 })
        .lean()
      if (!booking) return null
      const room = await findUnitTreatmentRoom(booking.unitId, booking.treatmentRoom.roomId.toString())
      return {
        therapistId: booking.therapistId.toString(),
        treatmentRoom: room && { roomId: room.id, beds: room.beds },
      }
    },
    hasConflict: conflictChecker(unitIds ?? []),
    findRoomBookings: roomBookingsFinder(unitIds ?? []),
    update: async (id, fields) => {
      const { matchedCount } = await Booking.updateOne(
        { _id: id, unitId: { $in: unitIds! }, appointmentId: null },
        { $set: fields },
      )
      return matchedCount > 0
    },
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}

export async function deleteBookingAction(workspaceId: string, bookingId: string): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const unitIds = await findManagedUnitIds(workspaceId, userId)

  const result = await deleteBooking(unitIds && isObjectIdOrHexString(bookingId) ? bookingId : null, async (id) => {
    const { deletedCount } = await Booking.deleteOne({ _id: id, unitId: { $in: unitIds! } })
    return deletedCount > 0
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}
