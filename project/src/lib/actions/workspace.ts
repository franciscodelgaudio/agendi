"use server"

import { refresh } from "next/cache"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { getSessionUserId } from "@/service/(auth)/session"
import { createWorkspace, updateWorkspace, type UpdateWorkspaceError } from "@/service/workspace/workspace"
import { findManagedWorkspace } from "@/service/workspace/[workspaceId]/workspace-access"
import { ADMIN_ROLE } from "@/service/workspace/[workspaceId]/users/member-store"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const errorMessages: Record<UpdateWorkspaceError | "unauthenticated", string> = {
  invalid_input: "Informe o nome do workspace.",
  invalid_name: "Informe o nome do workspace.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_image_url: "Informe uma URL válida começando com http:// ou https://.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type UpdateWorkspaceState = { error: string | null }

// workspaceId vem via argumento do cliente; exige a permissão de editar o workspace.
export async function updateWorkspaceAction(
  workspaceId: string,
  _prev: UpdateWorkspaceState,
  formData: FormData,
): Promise<UpdateWorkspaceState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }

  const managed = await findManagedWorkspace(workspaceId, userId, "workspace.manage")
  if (!managed.ok) {
    return { error: managed.error === "forbidden" ? forbiddenMessage("workspace.manage") : errorMessages[managed.error] }
  }
  const result = await updateWorkspace(
    { name: formData.get("name"), imageUrl: formData.get("imageUrl") },
    managed.access.id,
    async (id, { name, imageUrl }) => {
      // Sem imagem, o campo sai do documento em vez de ficar gravado como null.
      const { matchedCount } = await Workspace.updateOne(
        { _id: id },
        imageUrl ? { $set: { name, imageUrl } } : { $set: { name }, $unset: { imageUrl: 1 } },
      )
      return matchedCount > 0
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export type CreateWorkspaceState = { error: string; workspaceId?: never } | { error: null; workspaceId: string }

export async function createWorkspaceAction(formData: FormData): Promise<CreateWorkspaceState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }

  const result = await createWorkspace({ name: formData.get("name") }, userId, async ({ name, userId }) => {
    const workspace = await Workspace.create({ name, roles: [ADMIN_ROLE] })
    try {
      await WorkspaceMember.create({ workspaceId: workspace._id, userId, roleId: workspace.roles[0]._id })
    } catch (error) {
      await Workspace.deleteOne({ _id: workspace._id })
      throw error
    }
    return { id: workspace._id.toString() }
  })

  if (!result.ok) return { error: errorMessages[result.error] }
  return { error: null, workspaceId: result.workspaceId }
}
