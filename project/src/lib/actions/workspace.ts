"use server"

import { refresh } from "next/cache"
import { ageniaProviders } from "@/service/workspace/[workspaceId]/agenia/agenia-model"
import { updateAgeniaModel, type UpdateAgeniaModelError } from "@/service/workspace/[workspaceId]/agenia/agenia-models"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { getSessionUserId } from "@/service/(auth)/session"
import { updateWorkspace, type UpdateWorkspaceError } from "@/service/workspace/workspace"
import { findManagedWorkspace } from "@/service/workspace/[workspaceId]/workspace-access"
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
    { name: formData.get("name"), avatarUrl: formData.get("avatarUrl") },
    managed.access.id,
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

const ageniaModelErrors: Record<UpdateAgeniaModelError | "unauthenticated", string> = {
  invalid_model: "Escolha um modelo da lista.",
  provider_not_configured: "Esse provedor não tem chave configurada no ambiente.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

// Modelo usado pela AgenIA em todo o workspace; exige a permissão de editar o workspace.
export async function updateAgeniaModelAction(workspaceId: string, modelId: string): Promise<{ error: string | null }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: ageniaModelErrors.unauthenticated }

  const managed = await findManagedWorkspace(workspaceId, userId, "workspace.manage")
  if (!managed.ok) {
    return { error: managed.error === "forbidden" ? forbiddenMessage("workspace.manage") : ageniaModelErrors[managed.error] }
  }
  const result = await updateAgeniaModel(
    modelId,
    managed.access.id,
    ageniaProviders(),
    async (id, ageniaModel) => (await Workspace.updateOne({ _id: id }, { $set: { ageniaModel } })).matchedCount > 0,
  )
  if (!result.ok) return { error: ageniaModelErrors[result.error] }

  refresh()
  return { error: null }
}
