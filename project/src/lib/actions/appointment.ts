"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceTherapists, objectIds } from "@/lib/therapist-lookup"
import { findUnitProducts } from "@/lib/product-lookup"
import { forbiddenMessage, type UnitAccessError } from "@/lib/access-check"
import { findManagedUnit } from "@/lib/unit-access"
import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
  type CreateAppointmentError,
} from "@/lib/appointment"
import { bookingAppointmentInput, convertBooking } from "@/lib/booking-convert"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Unit } from "@/models/Unit"
import { Service } from "@/models/Service"

const errorMessages: Record<
  | CreateAppointmentError
  | "appointment_not_found"
  | "booking_not_found"
  | "booking_already_converted"
  | "workspace_not_found"
  | "unauthenticated",
  string
> = {
  invalid_input: "Preencha hóspede, quarto, data/hora e os serviços.",
  invalid_guest_name: "Informe o nome do hóspede.",
  guest_name_too_long: "O nome do hóspede pode ter no máximo 80 caracteres.",
  invalid_room: "Informe o quarto.",
  room_too_long: "O quarto pode ter no máximo 20 caracteres.",
  invalid_performed_at: "Informe uma data e hora válidas.",
  no_items: "Adicione pelo menos um serviço.",
  too_many_items: "Um atendimento pode ter no máximo 20 serviços.",
  invalid_item: "Escolha o serviço e o profissional de cada linha.",
  invalid_duration: "A duração de cada serviço deve ser entre 5 minutos e 12 horas.",
  service_not_found: "Algum serviço não foi encontrado nesta unidade. Recarregue a página.",
  therapist_not_found: "Algum profissional escolhido não pode atender neste workspace. Recarregue a página.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  too_many_products: "Escolha no máximo 20 produtos.",
  product_not_found: "Algum produto não foi encontrado nesta unidade. Recarregue a página.",
  appointment_not_found: "Atendimento não encontrado ou sem permissão.",
  booking_not_found: "Agendamento não encontrado ou sem permissão.",
  booking_already_converted: "Este agendamento já foi registrado como atendimento.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type AppointmentActionState = { error: string | null }

function accessError(error: UnitAccessError): AppointmentActionState {
  return { error: error === "forbidden" ? forbiddenMessage("appointments.manage") : errorMessages[error] }
}

// Unidade gerenciável pelo usuário, com o motivo quando não é.
function findAppointmentUnit(workspaceId: string, unitId: unknown, userId: string) {
  return findManagedUnit(workspaceId, typeof unitId === "string" ? unitId : "", userId, "appointments.manage")
}

function appointmentInput(formData: FormData) {
  return {
    guestName: formData.get("guestName"),
    room: formData.get("room"),
    performedAt: formData.get("performedAt"),
    serviceIds: formData.getAll("serviceId"),
    therapistIds: formData.getAll("therapistId"),
    // Sem o campo, vale a duração do cadastro de cada serviço.
    durations: formData.has("durationMinutes") ? formData.getAll("durationMinutes") : undefined,
    productIds: formData.getAll("productId"),
  }
}

// Buscas usadas por createAppointment/updateAppointment, restritas à unidade e ao workspace.
function appointmentLookups(unit: { workspaceId: string; unitId: string }) {
  return {
    findServices: async (ids: string[]) => {
      const services = await Service.find({ _id: { $in: objectIds(ids) }, unitId: unit.unitId })
        .select({ name: 1, priceCents: 1, durationMinutes: 1 })
        .lean()
      return services.map(({ _id, name, priceCents, durationMinutes }) => ({
        id: _id.toString(),
        name,
        priceCents,
        durationMinutes,
      }))
    },
    findTherapists: (ids: string[]) => findWorkspaceTherapists(unit.workspaceId, ids),
    findProducts: (ids: string[]) => findUnitProducts(unit.unitId, ids),
  }
}

// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createAppointmentAction(
  workspaceId: string,
  unitId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findAppointmentUnit(workspaceId, unitId, userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access

  const result = await createAppointment(appointmentInput(formData), unit.unitId, {
    ...appointmentLookups(unit),
    insert: async (data) => {
      const appointment = await Appointment.create({ ...data, createdBy: userId })
      return { id: appointment._id.toString() }
    },
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function updateAppointmentAction(
  workspaceId: string,
  unitId: string,
  appointmentId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findAppointmentUnit(workspaceId, unitId, userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access

  // A escrita ainda filtra por unitId.
  const result = await updateAppointment(
    appointmentInput(formData),
    isObjectIdOrHexString(appointmentId) ? appointmentId : null,
    {
      ...appointmentLookups(unit),
      update: async (id, fields) => {
        const { matchedCount } = await Appointment.updateOne({ _id: id, unitId: unit.unitId }, { $set: fields })
        return matchedCount > 0
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Visão do workspace: a unidade vem do formulário (campo unitId) e a posse é conferida
// em createAppointmentAction.
export async function createWorkspaceAppointmentAction(
  workspaceId: string,
  prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const unitId = formData.get("unitId")
  return createAppointmentAction(workspaceId, typeof unitId === "string" ? unitId : "", prev, formData)
}

// Visão do workspace: permite mover o atendimento para outra unidade. O atendimento
// precisa ser de alguma unidade do workspace, e a nova unidade precisa ser gerenciável.
export async function updateWorkspaceAppointmentAction(
  workspaceId: string,
  appointmentId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findAppointmentUnit(workspaceId, formData.get("unitId"), userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access

  const result = await updateAppointment(
    appointmentInput(formData),
    isObjectIdOrHexString(appointmentId) ? appointmentId : null,
    {
      ...appointmentLookups(unit),
      update: async (id, fields) => {
        const workspaceUnitIds = await Unit.find({ workspaceId: unit.workspaceId }).distinct("_id")
        const { matchedCount } = await Appointment.updateOne(
          { _id: id, unitId: { $in: workspaceUnitIds } },
          { $set: { ...fields, unitId: unit.unitId } },
        )
        return matchedCount > 0
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteAppointmentAction(
  workspaceId: string,
  unitId: string,
  appointmentId: string,
): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findAppointmentUnit(workspaceId, unitId, userId)
  if (!access.ok) return accessError(access.error)
  const { unit } = access

  // A exclusão ainda filtra por unitId.
  const result = await deleteAppointment(
    isObjectIdOrHexString(appointmentId) ? appointmentId : null,
    async (id) => {
      const { deletedCount } = await Appointment.deleteOne({ _id: id, unitId: unit.unitId })
      // O agendamento de onde o atendimento veio volta a ser editável e convertível.
      if (deletedCount > 0) await Booking.updateOne({ appointmentId: id }, { $set: { appointmentId: null } })
      return deletedCount > 0
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Registra o atendimento a partir de um agendamento do calendário. A unidade vem do
// formulário e precisa ser gerenciável; o agendamento precisa ser de alguma unidade do workspace.
export async function convertBookingAction(
  workspaceId: string,
  bookingId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findAppointmentUnit(workspaceId, formData.get("unitId"), userId)
  if (!access.ok) return accessError(access.error)
  return convertBookingInUnit(appointmentInput(formData), bookingId, access.unit, userId)
}

// Registro com um clique: o atendimento sai dos dados salvos no agendamento (inclusive a
// duração), sem formulário. A unidade é a do agendamento e precisa ser gerenciável.
export async function registerBookingAction(workspaceId: string, bookingId: string): Promise<AppointmentActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  if (!isObjectIdOrHexString(bookingId)) return { error: errorMessages.booking_not_found }
  const booking = await Booking.findById(bookingId)
    .select({ unitId: 1, guest: 1, startsAt: 1, endsAt: 1, service: 1, therapistId: 1, products: 1 })
    .lean()
  if (!booking) return { error: errorMessages.booking_not_found }
  const access = await findAppointmentUnit(workspaceId, booking.unitId.toString(), userId)
  if (!access.ok) return accessError(access.error)

  const input = bookingAppointmentInput({
    guest: { name: booking.guest?.name ?? "", room: booking.guest?.room ?? "" },
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    service: { serviceId: booking.service.serviceId.toString() },
    therapistId: booking.therapistId.toString(),
    products: booking.products.map((product) => ({ productId: product.productId.toString() })),
  })
  return convertBookingInUnit(input, bookingId, access.unit, userId)
}

async function convertBookingInUnit(
  input: unknown,
  bookingId: string,
  unit: { workspaceId: string; unitId: string },
  userId: string,
): Promise<AppointmentActionState> {
  const workspaceUnitIds = await Unit.find({ workspaceId: unit.workspaceId }).distinct("_id")

  const result = await convertBooking(
    input,
    { bookingId: isObjectIdOrHexString(bookingId) ? bookingId : null, unitId: unit.unitId },
    {
      ...appointmentLookups(unit),
      findBooking: async (id) => {
        const booking = await Booking.findOne({ _id: id, unitId: { $in: workspaceUnitIds } })
          .select({ appointmentId: 1 })
          .lean()
        return booking && { appointmentId: booking.appointmentId?.toString() ?? null }
      },
      insert: async (data) => {
        const appointment = await Appointment.create({ ...data, createdBy: userId })
        return { id: appointment._id.toString() }
      },
      link: async (id, appointmentId) => {
        const { matchedCount } = await Booking.updateOne({ _id: id, appointmentId: null }, { $set: { appointmentId } })
        return matchedCount > 0
      },
      removeAppointment: async (appointmentId) => {
        await Appointment.deleteOne({ _id: appointmentId })
      },
    },
  )

  return { error: result.ok ? null : errorMessages[result.error] }
}
