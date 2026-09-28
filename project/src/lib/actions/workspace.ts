"use server"

import { refresh } from "next/cache"
import { canManageMembers } from "@/lib/member"
import { getSessionUserId } from "@/lib/session"
import { updateWorkspace, type UpdateWorkspaceError } from "@/lib/workspace"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Workspace } from "@/models/Workspace"

const errorMessages: Record<UpdateWorkspaceError | "unauthenticated", string> = {
  invalid_input: "Informe o nome do workspace.",
  invalid_name: "Informe o nome do workspace.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_avatar_url: "Informe uma URL válida começando com http:// ou https://.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type UpdateWorkspaceState = { error: string | null }

// workspaceId vem via argumento do cliente; só dono e administradores podem editar.
export async function updateWorkspaceAction(
  workspaceId: string,
  _prev: UpdateWorkspaceState,
  formData: FormData,
): Promise<UpdateWorkspaceState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }

  const access = await findWorkspaceAccess(workspaceId, userId)
  const result = await updateWorkspace(
    { name: formData.get("name"), avatarUrl: formData.get("avatarUrl") },
    access && canManageMembers(access.role) ? access.id : null,
    async (id, { name, avatarUrl }) => {
      // Sem imagem, o campo sai do documento em vez de ficar gravado como null.
      const { matchedCount } = await Workspace.updateOne(
        { _id: id },
        avatarUrl ? { $set: { name, avatarUrl } } : { $set: { name }, $unset: { avatarUrl: 1 } },
      )
      return matchedCount > 0
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
