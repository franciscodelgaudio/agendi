"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createService,
  deleteService,
  updateService,
  type DeleteServiceError,
  type UpdateServiceError,
} from "@/service/workspace/[workspaceId]/services/service"
import { Appointment } from "@/models/Appointment"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

type ServiceError = UpdateServiceError | DeleteServiceError | "unit_not_found"

const errorMessages: Record<Exclude<ServiceError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha nome, duração e preço.",
  invalid_name: "Informe o nome do serviço.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_duration: "Informe a duração em minutos, de 5 a 720.",
  invalid_price: "Informe um preço válido, como 180,00.",
  service_not_found: "Serviço não encontrado neste workspace.",
  unit_not_found: "Unidade não encontrada neste workspace.",
  service_in_use: "Este serviço ainda tem agendamentos por fazer. Conclua, cancele ou troque o serviço deles antes.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ServiceActionState = { error: string | null }

function messageOf(error: ServiceError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("services.manage") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function serviceFilter(workspaceId: string, serviceId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(serviceId)) return null
  return { _id: new Types.ObjectId(serviceId), workspaceId: new Types.ObjectId(workspaceId) }
}

function serviceInput(formData: FormData) {
  return { name: formData.get("name"), duration: formData.get("duration"), price: formData.get("price") }
}

export async function createServiceAction(
  workspaceId: string,
  unitId: string,
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const validUnit = isObjectIdOrHexString(unitId) && !!(await Unit.exists({ _id: unitId, workspaceId: session.workspaceId }))
  if (session.actor && !validUnit) return { error: messageOf("unit_not_found") }

  const result = await createService(serviceInput(formData), { ...session, unitId }, {
    insert: async (data) => {
      const service = await Service.create(data)
      return { id: service._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateServiceAction(
  workspaceId: string,
  serviceId: string,
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = serviceFilter(session.workspaceId, serviceId)

  const result = await updateService(serviceInput(formData), filter && serviceId, session, {
    update: async (_id, data) => (await Service.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteServiceAction(workspaceId: string, serviceId: string): Promise<ServiceActionState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = serviceFilter(session.workspaceId, serviceId)

  const result = await deleteService(filter && serviceId, session, {
    hasScheduled: async () => !!(await Appointment.exists({ serviceId: filter!._id, status: "scheduled" })),
    remove: async () => (await Service.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
