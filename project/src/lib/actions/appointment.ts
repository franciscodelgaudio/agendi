"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createAppointment,
  deleteAppointment,
  rescheduleAppointment,
  setAppointmentStatus,
  updateAppointment,
  type AppointmentFieldsError,
  type RescheduleAppointmentError,
  type SetAppointmentStatusError,
  type UpdateAppointmentError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment"
import {
  appointmentLookups,
  blockChecker,
  conflictChecker,
  findUnitStation,
  stationAppointmentsFinder,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-store"
import { recordAppointmentIncome, removeAppointmentIncome } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import { customerListPipeline, type CustomerListPage } from "@/service/workspace/[workspaceId]/customers/customer-list"
import { Appointment } from "@/models/Appointment"
import { Customer } from "@/models/Customer"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

type AppointmentError =
  | AppointmentFieldsError
  | UpdateAppointmentError
  | RescheduleAppointmentError
  | SetAppointmentStatusError
  | "unit_not_found"

const errorMessages: Record<Exclude<AppointmentError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha serviço, cliente, profissional, estação e início.",
  invalid_service: "Escolha o serviço.",
  invalid_customer: "Escolha o cliente.",
  invalid_member: "Escolha a profissional.",
  invalid_station: "Escolha a estação.",
  invalid_starts_at: "Informe uma data e hora válidas.",
  invalid_duration: "O agendamento precisa durar entre 5 minutos e 12 horas.",
  invalid_color: "Escolha uma cor da lista.",
  invalid_status: "Situação inválida.",
  service_not_found: "O serviço escolhido não existe mais. Recarregue a página.",
  customer_not_found: "O cliente escolhido não existe mais. Recarregue a página.",
  member_not_found: "A profissional escolhida não atende nesta unidade. Recarregue a página.",
  station_not_found: "A estação escolhida não é desta unidade. Recarregue a página.",
  station_inactive: "A estação escolhida está desativada.",
  member_unavailable: "A profissional está indisponível nesse horário (agenda travada).",
  member_busy: "A profissional já tem um agendamento nesse horário.",
  station_busy: "A estação já tem um agendamento nesse horário.",
  appointment_not_found: "Agendamento não encontrado ou sem permissão.",
  appointment_not_scheduled: "Só é possível alterar agendamentos que ainda não foram concluídos nem cancelados.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type AppointmentActionState = { error: string | null }

function messageOf(
  error: AppointmentError | "unauthenticated",
  permission: "bookings.manage" | "appointments.manage" = "bookings.manage",
) {
  return error === "forbidden" ? forbiddenMessage(permission) : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function appointmentFilter(workspaceId: string, appointmentId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(appointmentId)) return null
  return { _id: new Types.ObjectId(appointmentId), workspaceId: new Types.ObjectId(workspaceId) }
}

function appointmentInput(formData: FormData) {
  return {
    serviceId: formData.get("serviceId"),
    customerId: formData.get("customerId"),
    workspaceMemberId: formData.get("workspaceMemberId"),
    stationId: formData.get("stationId"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes"),
    color: formData.get("color"),
  }
}

function toIds<T extends { serviceId: string; customerId: string; workspaceMemberId: string; stationId: string }>(fields: T) {
  return {
    ...fields,
    serviceId: new Types.ObjectId(fields.serviceId),
    customerId: new Types.ObjectId(fields.customerId),
    workspaceMemberId: new Types.ObjectId(fields.workspaceMemberId),
    stationId: new Types.ObjectId(fields.stationId),
  }
}

export async function createAppointmentAction(
  workspaceId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const unitId = formData.get("unitId")
  const validUnit =
    typeof unitId === "string" &&
    isObjectIdOrHexString(unitId) &&
    !!(await Unit.exists({ _id: unitId, workspaceId: session.workspaceId }))
  if (session.actor && !validUnit) return { error: messageOf("unit_not_found") }
  const unit = { workspaceId: session.workspaceId, unitId: String(unitId) }

  const result = await createAppointment(
    appointmentInput(formData),
    { ...unit, actor: session.actor },
    {
      ...appointmentLookups(unit),
      insert: async (data) => {
        const appointment = await Appointment.create({
          ...toIds(data),
          workspaceId: new Types.ObjectId(data.workspaceId),
          unitId: new Types.ObjectId(data.unitId),
        })
        return { id: appointment._id.toString() }
      },
    },
  )

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateAppointmentAction(
  workspaceId: string,
  appointmentId: string,
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = appointmentFilter(session.workspaceId, appointmentId)
  const current = filter && (await Appointment.findOne(filter).select({ status: 1, unitId: 1 }).lean())

  const result = await updateAppointment(appointmentInput(formData), filter && appointmentId, session, {
    ...appointmentLookups({ workspaceId: session.workspaceId, unitId: current?.unitId.toString() ?? "" }),
    findAppointment: async () => current && { status: current.status },
    update: async (_id, fields) =>
      (await Appointment.updateOne({ ...filter!, status: "scheduled" }, { $set: toIds(fields) })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function rescheduleAppointmentAction(
  workspaceId: string,
  appointmentId: string,
  times: { startsAt: string; endsAt: string },
): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = appointmentFilter(session.workspaceId, appointmentId)
  const current =
    filter &&
    (await Appointment.findOne(filter).select({ status: 1, unitId: 1, workspaceMemberId: 1, stationId: 1 }).lean())

  const result = await rescheduleAppointment(times, filter && appointmentId, session, {
    findAppointment: async () => {
      if (!current) return null
      const station = await findUnitStation(current.unitId, current.stationId.toString())
      return {
        status: current.status,
        workspaceMemberId: current.workspaceMemberId.toString(),
        station: station && { id: station.id, active: station.active },
      }
    },
    hasConflict: conflictChecker(session.workspaceId),
    isBlocked: blockChecker(session.workspaceId),
    findStationAppointments: stationAppointmentsFinder(current?.unitId ?? new Types.ObjectId()),
    update: async (_id, data) =>
      (await Appointment.updateOne({ ...filter!, status: "scheduled" }, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function setAppointmentStatusAction(
  workspaceId: string,
  appointmentId: string,
  status: string,
): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = appointmentFilter(session.workspaceId, appointmentId)
  let previous: string | null = null

  const result = await setAppointmentStatus({ status }, filter && appointmentId, session, {
    findAppointment: async () => {
      const found = await Appointment.findOne(filter!).select({ status: 1, serviceId: 1 }).lean()
      previous = found?.status ?? null
      return found && { status: found.status, serviceId: found.serviceId.toString() }
    },
    findServicePrice: async (serviceId) => {
      const service = await Service.findOne({ _id: serviceId, workspaceId: session.workspaceId })
        .select({ priceCents: 1 })
        .lean()
      return service?.priceCents ?? null
    },
    update: async (_id, next) => (await Appointment.updateOne(filter!, { $set: { status: next } })).matchedCount > 0,
    recordIncome: recordAppointmentIncome,
    removeIncome: removeAppointmentIncome,
  })

  if (!result.ok) {
    const touchesDone = status === "done" || previous === "done"
    return { error: messageOf(result.error, touchesDone ? "appointments.manage" : "bookings.manage") }
  }

  refresh()
  return { error: null }
}

export async function deleteAppointmentAction(workspaceId: string, appointmentId: string): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = appointmentFilter(session.workspaceId, appointmentId)

  const result = await deleteAppointment(filter && appointmentId, session, {
    remove: async () => (await Appointment.deleteOne(filter!)).deletedCount > 0,
    removeIncome: removeAppointmentIncome,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export type CustomerOption = { id: string; name: string; cellphone: string | null }

export async function searchCustomersAction(workspaceId: string, q: string): Promise<CustomerOption[]> {
  if (typeof q !== "string") return []
  const session = await sessionAccess(workspaceId)
  if (!session?.actor) return []
  const [page] = await Customer.aggregate<CustomerListPage>(
    customerListPipeline(session.workspaceId, { q: q.trim(), sort: "name", dir: "asc", page: 1 }),
  )
  return (page?.rows ?? []).map(({ id, name, cellphone }) => ({ id, name, cellphone }))
}
