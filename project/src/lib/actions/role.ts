"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import {
  createRole,
  deleteRole,
  renameRole,
  updateRolePermissions,
  type CreateRoleResult,
  type DeleteRoleResult,
  type RenameRoleResult,
  type UpdateRolePermissionsError,
} from "@/service/workspace/[workspaceId]/users/permissions/role"
import { getSessionUserId } from "@/service/(auth)/session"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { PERMISSIONS } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { Invite } from "@/models/Invite"
import { Workspace } from "@/models/Workspace"
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

type Access = Awaited<ReturnType<typeof findWorkspaceAccess>>

async function findAccess(workspaceId: string): Promise<{ error: string } | { access: Access }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  return { access: await findWorkspaceAccess(workspaceId, userId) }
}

async function listRoles(workspaceId: string) {
  const workspace = await Workspace.findById(workspaceId).select({ roles: 1 }).lean()
  return (workspace?.roles ?? []).filter((role) => !role.admin)
}

async function isNameTaken(workspaceId: string, name: string, exceptRoleId?: string) {
  const roles = await listRoles(workspaceId)
  return roles.some(
    (role) => !role._id.equals(exceptRoleId ?? null) && role.name.localeCompare(name, "pt", { sensitivity: "accent" }) === 0,
  )
}

async function findRole(workspaceId: string, roleId: string) {
  if (!isObjectIdOrHexString(roleId)) return null
  return (await listRoles(workspaceId)).find((role) => role._id.equals(roleId)) ?? null
}

export async function createRoleAction(
  workspaceId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState & { roleId?: string }> {
  const found = await findAccess(workspaceId)
  if ("error" in found) return found
  const { access } = found
  const baseRoleId = formData.get("baseRoleId")

  const input = { name: formData.get("name"), baseRoleId: baseRoleId === "none" ? null : baseRoleId }
  const result = await createRole(input, { actor: access?.actor ?? null }, {
    isNameTaken: (name) => isNameTaken(access!.id, name),
    findBaseRole: async (roleId) => {
      const role = await findRole(access!.id, roleId)
      if (!role) return null
      const pages = visiblePages({ admin: false, permissions: role.permissions, pages: role.pages ?? { workspace: [], unit: [] } })
      return { permissions: role.permissions.filter((item) => PERMISSIONS.includes(item)), pages }
    },
    create: async (data) => {
      const _id = new Types.ObjectId()
      await Workspace.updateOne({ _id: access!.id }, { $push: { roles: { _id, ...data } } })
      return { id: _id.toString() }
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null, roleId: result.roleId }
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

  const result = await renameRole({ name: formData.get("name") }, access && roleId, { actor: access?.actor ?? null }, {
    findRole: async () => {
      const role = await findRole(access!.id, roleId)
      return role && { id: role._id.toString() }
    },
    isNameTaken: (name, exceptRoleId) => isNameTaken(access!.id, name, exceptRoleId),
    rename: async (_id, name) => {
      await Workspace.updateOne({ _id: access!.id, roles: { $elemMatch: { _id: roleId, admin: { $ne: true } } } }, { $set: { "roles.$.name": name } })
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

  const result = await deleteRole(access && isObjectIdOrHexString(roleId) ? roleId : null, { actor: access?.actor ?? null }, {
    countMembers: async () => {
      const [members, invites] = await Promise.all([
        WorkspaceMember.countDocuments({ workspaceId: access!.id, roleId }),
        Invite.countDocuments({ workspaceId: access!.id, roleId }),
      ])
      return members + invites
    },
    remove: async () =>
      (await Workspace.updateOne({ _id: access!.id }, { $pull: { roles: { _id: roleId, admin: { $ne: true } } } })).modifiedCount > 0,
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
      const roles = await listRoles(access!.id)
      return roles.map((role) => role._id.toString())
    },
    save: async (settings) => {
      // bulkWrite recusa lista vazia (workspace sem roles).
      if (Object.keys(settings).length === 0) return
      await Workspace.bulkWrite(
        Object.entries(settings).map(([roleId, { permissions, pages }]) => ({
          updateOne: {
            filter: { _id: access!.id, "roles._id": roleId },
            update: { $set: { "roles.$.permissions": permissions, "roles.$.pages": pages } },
          },
        })),
      )
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
