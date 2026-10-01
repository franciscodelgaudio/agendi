"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findUnitProducts } from "@/service/workspace/[workspaceId]/stock/products/product-lookup"
import { findManagedUnit } from "@/service/workspace/[workspaceId]/unit/[unitId]/unit-access"
import {
  createService,
  deleteService,
  updateService,
  type CreateServiceError,
  type UpdateServiceError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service"
import { Service } from "@/models/Service"

const errorMessages: Record<CreateServiceError | UpdateServiceError | "workspace_not_found" | "unauthenticated", string> = {
  invalid_input: "Preencha nome, valor e duração.",
  too_many_products: "Escolha no máximo 20 produtos.",
  product_not_found: "Algum produto não foi encontrado nesta unidade. Recarregue a página.",
  invalid_name: "Informe o nome do serviço.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_price: "Informe um valor entre R$ 0,00 e R$ 1.000.000,00, com até 2 casas decimais.",
  invalid_duration: "Informe a duração em minutos, entre 1 e 1440.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  service_not_found: "Serviço não encontrado ou sem permissão.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ServiceActionState = { error: string | null }

// id da unidade se o usuário puder gerenciá-la; senão a mensagem de erro.
async function findManagedUnitId(workspaceId: string, unitId: string): Promise<{ unitId: string } | { error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findManagedUnit(workspaceId, unitId, userId, "services.manage")
  if (!access.ok) {
    return { error: access.error === "forbidden" ? forbiddenMessage("services.manage") : errorMessages[access.error] }
  }
  return { unitId: access.unit.unitId }
}

function serviceInput(formData: FormData) {
  return {
    name: formData.get("name"),
    price: formData.get("price"),
    durationMinutes: formData.get("durationMinutes"),
    productIds: formData.getAll("productId"),
  }
}

// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createServiceAction(
  workspaceId: string,
  unitId: string,
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const owned = await findManagedUnitId(workspaceId, unitId)
  if ("error" in owned) return owned
  const ownedUnitId = owned.unitId

  const result = await createService(serviceInput(formData), ownedUnitId, {
    insert: async (data) => {
      const service = await Service.create(data)
      return { id: service._id.toString() }
    },
    findProducts: (ids) => findUnitProducts(ownedUnitId, ids),
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// A escrita ainda filtra por unitId para que um serviço de outra unidade não seja encontrado.
async function resolveServiceTarget(workspaceId: string, unitId: string, serviceId: string) {
  const owned = await findManagedUnitId(workspaceId, unitId)
  if ("error" in owned) return owned
  return { ownedUnitId: owned.unitId, serviceId: isObjectIdOrHexString(serviceId) ? serviceId : null }
}

export async function updateServiceAction(
  workspaceId: string,
  unitId: string,
  serviceId: string,
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const target = await resolveServiceTarget(workspaceId, unitId, serviceId)
  if ("error" in target) return target

  const result = await updateService(serviceInput(formData), target.serviceId, {
    update: async (id, data) => {
      const { matchedCount } = await Service.updateOne({ _id: id, unitId: target.ownedUnitId }, { $set: data })
      return matchedCount > 0
    },
    findProducts: (ids) => findUnitProducts(target.ownedUnitId, ids),
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteServiceAction(
  workspaceId: string,
  unitId: string,
  serviceId: string,
): Promise<ServiceActionState> {
  const target = await resolveServiceTarget(workspaceId, unitId, serviceId)
  if ("error" in target) return target

  const result = await deleteService(target.serviceId, async (id) => {
    const { deletedCount } = await Service.deleteOne({ _id: id, unitId: target.ownedUnitId })
    return deletedCount > 0
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
