"use server"

import { isObjectIdOrHexString, type Types } from "mongoose"
import { forbiddenMessage, type UnitAccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { getSessionUserId } from "@/service/(auth)/session"
import { blockChecker, bookingLookups, conflictChecker, findUnitTreatmentRoom, roomBookingsFinder } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-store"
import { findManagedUnit } from "@/service/workspace/[workspaceId]/unit/[unitId]/unit-access"
import { findManagedWorkspace } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  correctRegisteredBooking,
  createBooking,
  deleteBooking,
  rescheduleBooking,
  updateBooking,
  type AppointmentSync,
  type BookingError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Unit } from "@/models/Unit"

const errorMessages: Record<BookingError | "workspace_not_found" | "unauthenticated", string> = {
  invalid_input: "Preencha profissional, espaço, cliente, início e duração.",
  invalid_therapist: "Escolha o profissional.",
  invalid_service: "Escolha o serviço.",
  invalid_treatment_room: "Escolha o espaço.",
  invalid_guest_name: "Informe o nome do hóspede.",
  guest_name_too_long: "O nome do hóspede pode ter no máximo 80 caracteres.",
  invalid_room: "Informe o quarto ou marque cliente de fora.",
  customer_not_found: "Cliente não encontrado. Escolha um cliente cadastrado neste workspace.",
  room_too_long: "O quarto pode ter no máximo 20 caracteres.",
  invalid_starts_at: "Informe uma data e hora válidas.",
  invalid_duration: "O agendamento precisa durar entre 5 minutos e 12 horas.",
  invalid_color: "Escolha uma cor da lista.",
  service_not_found: "O serviço escolhido não é desta unidade. Recarregue a página.",
  service_inactive: "Este serviço está desativado. Escolha outro.",
  therapist_not_found: "O profissional escolhido não pode atender neste workspace. Recarregue a página.",
  therapist_busy: "O profissional já tem um agendamento nesse horário.",
  therapist_unavailable: "O profissional está indisponível nesse horário (agenda travada).",
  treatment_room_not_found: "O espaço escolhido não é desta unidade. Recarregue a página.",
  treatment_room_not_allowed: "Este serviço não pode ser feito no espaço escolhido.",
  room_full: "O espaço já está lotado nesse horário.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  booking_not_found: "Agendamento não encontrado ou sem permissão.",
  booking_registered: "Este agendamento acabou de virar atendimento. Recarregue a página para corrigi-lo.",
  duration_locked: "Este atendimento tem mais de um serviço: a duração só pode ser alterada em Atendimentos.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  too_many_products: "Escolha no máximo 20 produtos.",
  product_not_found: "Algum produto não foi encontrado nesta unidade. Recarregue a página.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type BookingActionState = { error: string | null }

function bookingInput(formData: FormData) {
  return {
    therapistId: formData.get("therapistId"),
    guestName: formData.get("guestName"),
    // O campo some do formulário quando o cliente é de fora.
    room: formData.get("room") ?? "",
    outsideGuest: formData.get("outsideGuest") === "on",
    // Cliente recorrente escolhido no formulário; vazio = avulso.
    customerId: formData.get("customerId"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes"),
    serviceId: formData.get("serviceId"),
    treatmentRoomId: formData.get("treatmentRoomId"),
    productIds: formData.getAll("productId"),
    color: formData.get("color"),
  }
}

function accessError(error: UnitAccessError): BookingActionState {
  return { error: error === "forbidden" ? forbiddenMessage("bookings.manage") : errorMessages[error] }
}

// Unidade gerenciável pelo usuário (vinda do formulário), com o motivo quando não é.
function findBookingUnit(workspaceId: string, formData: FormData, userId: string) {
  const unitId = formData.get("unitId")
  return findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId, "bookings.manage")
}

// Unidades ativas do workspace, se o usuário pode gerenciar agendamentos; senão o motivo.
async function findManagedUnitIds(workspaceId: string, userId: string) {
  const managed = await findManagedWorkspace(workspaceId, userId, "bookings.manage")
  if (!managed.ok) return managed
  return { ok: true as const, unitIds: await Unit.find({ workspaceId: managed.access.id, deactivatedAt: null }).distinct("_id") }
}

// workspaceId vem via argumento e a unidade pelo formulário (campo unitId); a posse é conferida aqui.
export async function createBookingAction(
  workspaceId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findBookingUnit(workspaceId, formData, userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access
  const unitIds = await Unit.find({ workspaceId: unit.workspaceId, deactivatedAt: null }).distinct("_id")

  const result = await createBooking(bookingInput(formData), unit.unitId, {
    ...(await bookingLookups(unit, unitIds)),
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
  const access = await findBookingUnit(workspaceId, formData, userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access
  const unitIds = await Unit.find({ workspaceId: unit.workspaceId, deactivatedAt: null }).distinct("_id")

  const result = await updateBooking(bookingInput(formData), isObjectIdOrHexString(bookingId) ? bookingId : null, {
    ...(await bookingLookups(unit, unitIds)),
    update: async (id, fields) => {
      // Agendamento que já virou atendimento não é mais editável.
      const { matchedCount } = await Booking.updateOne(
        { _id: id, unitId: { $in: unitIds }, appointmentId: null },
        { $set: { ...fields, unitId: unit.unitId } },
      )
      if (matchedCount > 0) return true
      const registered = await Booking.exists({ _id: id, unitId: { $in: unitIds }, appointmentId: { $ne: null } })
      return registered ? "registered" : false
    },
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}

const MINUTE_MS = 60 * 1000

// Leva a correção do agendamento para o atendimento de onde ele virou. A duração só muda
// em atendimento de um serviço (o serviço recusa mudar a dos demais).
async function syncAppointment(
  appointmentId: Types.ObjectId,
  { performedAt, guest, durationMinutes }: Omit<AppointmentSync, "guest"> & { guest?: AppointmentSync["guest"] },
) {
  await Appointment.updateOne(
    { _id: appointmentId, ...(durationMinutes != null && { items: { $size: 1 } }) },
    {
      $set: {
        performedAt,
        ...(guest && { guest }),
        ...(durationMinutes != null && { "items.0.durationMinutes": durationMinutes }),
      },
    },
  )
}

// Corrige pelo formulário um agendamento que já virou atendimento; o atendimento acompanha.
export async function correctBookingAction(
  workspaceId: string,
  bookingId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  if (!isObjectIdOrHexString(bookingId)) return { error: errorMessages.booking_not_found }
  const booking = await Booking.findOne({ _id: bookingId, appointmentId: { $ne: null } })
    .select({ unitId: 1, therapistId: 1, service: 1, startsAt: 1, endsAt: 1, appointmentId: 1 })
    .lean()
  if (!booking?.appointmentId) return { error: errorMessages.booking_not_found }
  // A unidade é a do agendamento (e do atendimento) e precisa ser gerenciável.
  const access = await findManagedUnit(workspaceId, booking.unitId.toString(), userId, "bookings.manage")
  if (!access.ok) return accessError(access.error)
  const { unit } = access
  const unitIds = await Unit.find({ workspaceId: unit.workspaceId, deactivatedAt: null }).distinct("_id")
  const { appointmentId } = booking

  const result = await correctRegisteredBooking(bookingInput(formData), bookingId, {
    ...(await bookingLookups(unit, unitIds)),
    findBooking: async () => {
      const appointment = await Appointment.findById(appointmentId).select({ items: 1 }).lean()
      if (!appointment) return null
      return {
        therapistId: booking.therapistId?.toString() ?? null,
        serviceId: booking.service.serviceId.toString(),
        durationMinutes: (booking.endsAt.getTime() - booking.startsAt.getTime()) / MINUTE_MS,
        serviceCount: appointment.items.length,
      }
    },
    update: async (id, fields, appointment) => {
      const { matchedCount } = await Booking.updateOne({ _id: id, appointmentId }, { $set: fields })
      if (matchedCount === 0) return false
      await syncAppointment(appointmentId, appointment)
      return true
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
  const managed = await findManagedUnitIds(workspaceId, userId)
  if (!managed.ok) return accessError(managed.error)
  const { unitIds } = managed

  // A escrita ainda filtra pelas unidades do workspace.
  const result = await rescheduleBooking(times, isObjectIdOrHexString(bookingId) ? bookingId : null, {
    findBooking: async (id) => {
      const booking = await Booking.findOne({ _id: id, unitId: { $in: unitIds } })
        .select({ therapistId: 1, unitId: 1, treatmentRoom: 1, appointmentId: 1 })
        .lean()
      if (!booking) return null
      const room = await findUnitTreatmentRoom(booking.unitId, booking.treatmentRoom.roomId.toString())
      return {
        therapistId: booking.therapistId?.toString() ?? null,
        treatmentRoom: room && { roomId: room.id, beds: room.beds },
        registered: booking.appointmentId != null,
      }
    },
    hasConflict: conflictChecker(unitIds),
    isBlocked: blockChecker(workspaceId),
    findRoomBookings: roomBookingsFinder(unitIds),
    // Agendamento que virou atendimento entre a leitura e a escrita não é alterado.
    update: async (id, fields) => {
      const { matchedCount } = await Booking.updateOne(
        { _id: id, unitId: { $in: unitIds }, appointmentId: null },
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
  const managed = await findManagedUnitIds(workspaceId, userId)
  if (!managed.ok) return accessError(managed.error)
  const { unitIds } = managed

  // Agendamento que já virou atendimento não é excluído: o atendimento ficaria sem agendamento.
  const result = await deleteBooking(isObjectIdOrHexString(bookingId) ? bookingId : null, async (id) => {
    const { deletedCount } = await Booking.deleteOne({ _id: id, unitId: { $in: unitIds }, appointmentId: null })
    if (deletedCount > 0) return true
    const registered = await Booking.exists({ _id: id, unitId: { $in: unitIds }, appointmentId: { $ne: null } })
    return registered ? "registered" : false
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}
