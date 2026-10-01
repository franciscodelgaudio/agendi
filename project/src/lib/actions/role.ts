"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import {
  createRole,
  deleteRole,
  renameRole,
  updateRolePermissions,
  type CreateRoleResult,
  type DeleteRoleResult,
  type RenameRoleResult,
  type UpdateRolePermissionsError,
} from "@/lib/role"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Role } from "@/models/Role"
import { WorkspaceMember } from "@/models/WorkspaceMember"

type RoleError =
  | Extract<CreateRoleResult | RenameRoleResult | DeleteRoleResult, { ok: false }>["error"]
  | UpdateRolePermissionsError
  | "unauthenticated"

const errorMessages: Record<RoleError, string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Só administradores definem as funções e as permissões.",
  invalid_input: "Dados inválidos. Recarregue a página e tente novamente.",
  invalid_name: "Informe o nome da função.",
  name_too_long: "O nome pode ter no máximo 40 caracteres.",
  name_taken: "Já existe uma função com esse nome.",
  role_not_found: "Função não encontrada neste workspace.",
  role_in_use: "Há usuários ou convites com essa função. Troque a função deles antes de excluir.",
  no_workspace_page: "Deixe ao menos uma página do sistema liberada para cada função.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type RoleFormState = { error: string | null }

// Mesmo critério do índice único: sem diferenciar maiúsculas.
const NAME_COLLATION = { locale: "pt", strength: 2 }

type Access = Awaited<ReturnType<typeof findWorkspaceAccess>>

async function findAccess(workspaceId: string): Promise<{ error: string } | { access: Access }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  return { access: await findWorkspaceAccess(workspaceId, userId) }
}

function isNameTaken(workspaceId: string, name: string, exceptRoleId?: string) {
  const filter = { workspaceId, name, ...(exceptRoleId ? { _id: { $ne: exceptRoleId } } : {}) }
  return Role.findOne(filter).collation(NAME_COLLATION).select({ _id: 1 }).lean().then(Boolean)
}

function roleFilter(workspaceId: string, roleId: string) {
  return isObjectIdOrHexString(roleId) ? { _id: roleId, workspaceId } : null
}

export async function createRoleAction(workspaceId: string, _prev: RoleFormState, formData: FormData): Promise<RoleFormState> {
  const found = await findAccess(workspaceId)
  if ("error" in found) return found
  const { access } = found

  const result = await createRole({ name: formData.get("name") }, { actor: access?.actor ?? null }, {
    isNameTaken: (name) => isNameTaken(access!.id, name),
    create: async (data) => {
      const role = await Role.create({ workspaceId: access!.id, ...data })
      return { id: role._id.toString() }
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function renameRoleAction(
  workspaceId: string,
  roleId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const found = await findAccess(workspaceId)
  if ("error" in found) return found
  const { access } = found
  const filter = access && roleFilter(access.id, roleId)

  const result = await renameRole({ name: formData.get("name") }, filter && roleId, { actor: access?.actor ?? null }, {
    findRole: async () => {
      const role = await Role.findOne(filter!).select({ _id: 1 }).lean()
      return role && { id: role._id.toString() }
    },
    isNameTaken: (name, exceptRoleId) => isNameTaken(access!.id, name, exceptRoleId),
    rename: async (_id, name) => {
      await Role.updateOne(filter!, { $set: { name } })
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteRoleAction(workspaceId: string, roleId: string): Promise<RoleFormState> {
  const found = await findAccess(workspaceId)
  if ("error" in found) return found
  const { access } = found
  const filter = access && roleFilter(access.id, roleId)

  const result = await deleteRole(filter && roleId, { actor: access?.actor ?? null }, {
    countMembers: () => WorkspaceMember.countDocuments({ workspaceId: access!.id, roleId }),
    remove: async () => (await Role.deleteOne(filter!)).deletedCount > 0,
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Cada checkbox marcado chega como "<roleId>.<permissions|workspace|unit>" = valor; o campo
// oculto "roleId" lista as roles que estavam na tela, para incluir as sem nada marcado.
export async function updateRolePermissionsAction(
  workspaceId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const found = await findAccess(workspaceId)
  if ("error" in found) return found
  const { access } = found

  const input = Object.fromEntries(
    formData.getAll("roleId").map((roleId) => [
      String(roleId),
      {
        permissions: formData.getAll(`${roleId}.permissions`),
        workspace: formData.getAll(`${roleId}.workspace`),
        unit: formData.getAll(`${roleId}.unit`),
      },
    ]),
  )
  const result = await updateRolePermissions(input, { actor: access?.actor ?? null }, {
    listRoleIds: async () => {
      const roles = await Role.find({ workspaceId: access!.id }).select({ _id: 1 }).lean()
      return roles.map((role) => role._id.toString())
    },
    save: async (settings) => {
      // bulkWrite recusa lista vazia (workspace sem roles).
      if (Object.keys(settings).length === 0) return
      await Role.bulkWrite(
        Object.entries(settings).map(([roleId, { permissions, pages }]) => ({
          updateOne: { filter: { _id: roleId, workspaceId: access!.id }, update: { $set: { permissions, pages } } },
        })),
      )
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
