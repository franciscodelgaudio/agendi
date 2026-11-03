"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createAppointment,
  deleteAppointment,
  rescheduleAppointment,
  setAppointmentStatus,
  updateAppointment,
  type AppointmentFields,
  type AppointmentFieldsError,
  type DeleteAppointmentError,
  type RescheduleAppointmentError,
  type SetAppointmentStatusError,
  type UpdateAppointmentError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment"
import {
  appointmentLookups,
  conflictChecker,
  findUnitStation,
  stationAppointmentsFinder,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-store"
import {
  findReceivableToConfirm,
  isAppointmentSettled,
  recordAppointmentReceivable,
  removeAppointmentReceivable,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"
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
  | DeleteAppointmentError
  | "unit_not_found"

const errorMessages: Record<Exclude<AppointmentError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha serviço, profissional, estação e início.",
  invalid_service: "Escolha o serviço.",
  invalid_customer: "Escolha o cliente.",
  invalid_customer_name: "Informe o nome do cliente.",
  customer_name_too_long: "O nome do cliente pode ter no máximo 120 caracteres.",
  customer_observation_too_long: "A observação do cliente pode ter no máximo 1000 caracteres.",
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
  member_busy: "A profissional já tem um agendamento nesse horário.",
  station_busy: "A estação já tem um agendamento nesse horário.",
  appointment_not_found: "Agendamento não encontrado ou sem permissão.",
  appointment_not_scheduled: "Só é possível alterar agendamentos que ainda não foram concluídos nem cancelados.",
  appointment_settled: "Este atendimento já está num repasse conferido. Desfaça a conferência antes.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type AppointmentActionState = { error: string | null }

export type ReceivableToConfirm = { id: string; name: string; valueCents: number; accruedAt: Date }

export type AppointmentStatusState = { error: string | null; receivableToConfirm: ReceivableToConfirm | null }

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

function customerInput(formData: FormData) {
  const kind = formData.get("customerKind")
  if (!kind) return null
  return {
    kind,
    customerId: formData.get("customerId"),
    name: formData.get("customerName"),
    observation: formData.get("customerObservation"),
  }
}

function appointmentInput(formData: FormData) {
  return {
    serviceId: formData.get("serviceId"),
    customer: customerInput(formData),
    workspaceMemberId: formData.get("workspaceMemberId"),
    stationId: formData.get("stationId"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes"),
    color: formData.get("color"),
  }
}

function toIds<T extends AppointmentFields>({ customer, ...fields }: T) {
  return {
    ...fields,
    customer:
      customer?.kind === "registered" ? { kind: customer.kind, customerId: new Types.ObjectId(customer.customerId) } : customer,
    serviceId: new Types.ObjectId(fields.serviceId),
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
        station: station && { id: station.id },
      }
    },
    hasConflict: conflictChecker(session.workspaceId),
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
): Promise<AppointmentStatusState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated"), receivableToConfirm: null }
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
    isSettled: isAppointmentSettled,
    recordReceivable: recordAppointmentReceivable,
    removeReceivable: removeAppointmentReceivable,
  })

  if (!result.ok) {
    const touchesDone = status === "done" || previous === "done"
    return {
      error: messageOf(result.error, touchesDone ? "appointments.manage" : "bookings.manage"),
      receivableToConfirm: null,
    }
  }

  const confirms = status === "done" && previous !== "done" && !!session.actor && can(session.actor, "cash_flow.manage")
  refresh()
  return { error: null, receivableToConfirm: confirms ? await findReceivableToConfirm(appointmentId) : null }
}

export async function deleteAppointmentAction(workspaceId: string, appointmentId: string): Promise<AppointmentActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = appointmentFilter(session.workspaceId, appointmentId)

  const result = await deleteAppointment(filter && appointmentId, session, {
    isSettled: isAppointmentSettled,
    remove: async () => (await Appointment.deleteOne(filter!)).deletedCount > 0,
    removeReceivable: removeAppointmentReceivable,
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
