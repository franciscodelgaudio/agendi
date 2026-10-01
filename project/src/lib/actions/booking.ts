"use server"

import { isObjectIdOrHexString } from "mongoose"
import { can } from "@/lib/permissions"
import { getSessionUserId } from "@/lib/session"
import { bookingLookups, conflictChecker, findUnitTreatmentRoom, roomBookingsFinder } from "@/lib/booking-store"
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

// Unidades do workspace, se o usuário pode gerenciar agendamentos; senão null.
async function findManagedUnitIds(workspaceId: string, userId: string) {
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access || !can(access.actor, "bookings.manage")) return null
  return Unit.find({ workspaceId: access.id }).distinct("_id")
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
  const unit = await findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId, "bookings.manage")
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
  const unit = await findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId, "bookings.manage")
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
