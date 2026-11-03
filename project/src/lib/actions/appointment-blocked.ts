"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createAppointmentBlocked,
  deleteAppointmentBlocked,
  updateAppointmentBlocked,
  type AppointmentBlockedFields,
  type DeleteAppointmentBlockedError,
  type UpdateAppointmentBlockedError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-blocked"
import {
  appointmentBlockedLookups,
  findActorMemberId,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-store"
import { AppointmentBlocked } from "@/models/Appointment"
import { Unit } from "@/models/Unit"

type AppointmentBlockedError = UpdateAppointmentBlockedError | DeleteAppointmentBlockedError | "unit_not_found"

const errorMessages: Record<Exclude<AppointmentBlockedError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha profissional, início e duração.",
  invalid_member: "Escolha a profissional.",
  invalid_starts_at: "Informe uma data e hora válidas.",
  invalid_duration: "O bloqueio precisa durar entre 5 minutos e 12 horas.",
  reason_too_long: "O motivo pode ter no máximo 120 caracteres.",
  member_not_found: "A profissional escolhida não atende nesta unidade. Recarregue a página.",
  member_busy: "A profissional já tem agendamento nesse horário.",
  appointment_blocked_not_found: "Bloqueio não encontrado ou sem permissão.",
  unit_not_found: "Escolha uma unidade válida deste workspace.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type AppointmentBlockedActionState = { error: string | null }

function messageOf(error: AppointmentBlockedError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("schedule.block_others") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  const id = access?.id ?? workspaceId
  return { workspaceId: id, actor: access?.actor ?? null, actorMemberId: access ? await findActorMemberId(id, userId) : null }
}

function blockedFilter(workspaceId: string, appointmentBlockedId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(appointmentBlockedId)) return null
  return { _id: new Types.ObjectId(appointmentBlockedId), workspaceId: new Types.ObjectId(workspaceId) }
}

function blockedInput(formData: FormData) {
  return {
    workspaceMemberId: formData.get("workspaceMemberId"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes"),
    reason: formData.get("reason"),
  }
}

function toIds(fields: AppointmentBlockedFields) {
  return { ...fields, workspaceMemberId: new Types.ObjectId(fields.workspaceMemberId) }
}

async function findBlocked(filter: ReturnType<typeof blockedFilter>) {
  const found = filter && (await AppointmentBlocked.findOne(filter).select({ workspaceMemberId: 1, unitId: 1 }).lean())
  return found ? { workspaceMemberId: found.workspaceMemberId.toString(), unitId: found.unitId?.toString() ?? null } : null
}

export async function createAppointmentBlockedAction(
  workspaceId: string,
  _prev: AppointmentBlockedActionState,
  formData: FormData,
): Promise<AppointmentBlockedActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const rawUnitId = formData.get("unitId")
  const unitId = typeof rawUnitId === "string" && rawUnitId ? rawUnitId : null
  const validUnit =
    unitId === null ||
    (isObjectIdOrHexString(unitId) && !!(await Unit.exists({ _id: unitId, workspaceId: session.workspaceId })))
  if (session.actor && !validUnit) return { error: messageOf("unit_not_found") }

  const result = await createAppointmentBlocked(
    blockedInput(formData),
    { ...session, unitId },
    {
      ...appointmentBlockedLookups({ workspaceId: session.workspaceId, unitId }),
      insert: async ({ workspaceId: id, unitId: unit, ...fields }) => {
        const blocked = await AppointmentBlocked.create({
          ...toIds(fields),
          workspaceId: new Types.ObjectId(id),
          unitId: unit ? new Types.ObjectId(unit) : null,
        })
        return { id: blocked._id.toString() }
      },
    },
  )

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateAppointmentBlockedAction(
  workspaceId: string,
  appointmentBlockedId: string,
  _prev: AppointmentBlockedActionState,
  formData: FormData,
): Promise<AppointmentBlockedActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = blockedFilter(session.workspaceId, appointmentBlockedId)
  const current = await findBlocked(filter)

  const result = await updateAppointmentBlocked(blockedInput(formData), filter && appointmentBlockedId, session, {
    ...appointmentBlockedLookups({ workspaceId: session.workspaceId, unitId: current?.unitId ?? null }),
    findAppointmentBlocked: async () => current,
    update: async (_id, fields) => (await AppointmentBlocked.updateOne(filter!, { $set: toIds(fields) })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteAppointmentBlockedAction(
  workspaceId: string,
  appointmentBlockedId: string,
): Promise<AppointmentBlockedActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = blockedFilter(session.workspaceId, appointmentBlockedId)

  const result = await deleteAppointmentBlocked(filter && appointmentBlockedId, session, {
    findAppointmentBlocked: () => findBlocked(filter),
    remove: async () => (await AppointmentBlocked.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
