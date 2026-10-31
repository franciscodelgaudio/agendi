"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
  type CreateCustomerError,
  type UpdateCustomerError,
} from "@/service/workspace/[workspaceId]/customers/customer"
import { Customer } from "@/models/Customer"

const errorMessages: Record<CreateCustomerError | UpdateCustomerError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Sua função não tem permissão para gerenciar clientes.",
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome do cliente.",
  name_too_long: "O nome pode ter no máximo 120 caracteres.",
  observation_too_long: "A observação pode ter no máximo 1000 caracteres.",
  invalid_cellphone: "Informe um celular com DDD.",
  customer_not_found: "Cliente não encontrado neste workspace.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type CustomerFormState = { error: string | null; customerId?: string }

function customerInput(formData: FormData) {
  return {
    name: formData.get("name"),
    observation: formData.get("observation"),
    cellphone: formData.get("cellphone"),
  }
}

function workspaceFilter(workspaceId: string, customerId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(customerId)) return null
  return { _id: new Types.ObjectId(customerId), workspaceId: new Types.ObjectId(workspaceId) }
}

async function sessionActor(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { actor: access?.actor ?? null }
}

export async function createCustomerAction(
  workspaceId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const session = await sessionActor(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }

  const result = await createCustomer(customerInput(formData), { workspaceId, actor: session.actor }, {
    insert: async (data) => {
      const customer = await Customer.create(data)
      return { id: customer._id.toString() }
    },
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null, customerId: result.customerId }
}

export async function updateCustomerAction(
  workspaceId: string,
  customerId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const session = await sessionActor(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, customerId)

  const result = await updateCustomer(customerInput(formData), filter && customerId, session, {
    update: async (_id, data) => (await Customer.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteCustomerAction(workspaceId: string, customerId: string): Promise<CustomerFormState> {
  const session = await sessionActor(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, customerId)

  const result = await deleteCustomer(filter && customerId, session, {
    remove: async () => (await Customer.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
