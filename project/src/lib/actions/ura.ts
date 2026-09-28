"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { canUseInbox } from "@/lib/member-role"
import { getSessionUserId } from "@/lib/session"
import { createUra, deleteUra, saveUra, setUraActive, type UraError } from "@/lib/ura"
import { endConversationSessions } from "@/lib/ura-store"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Conversation } from "@/models/Conversation"
import { Ura } from "@/models/Ura"
import { UraSession } from "@/models/UraSession"

const errorMessages: Record<UraError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado.",
  forbidden: "Só o proprietário e administradores podem gerenciar URAs.",
  invalid_input: "Informe o nome da URA.",
  invalid_name: "Informe o nome da URA.",
  name_too_long: "O nome pode ter no máximo 60 caracteres.",
  ura_not_found: "URA não encontrada ou sem permissão.",
  invalid_graph: "O fluxo tem dados inválidos. Recarregue a página.",
  missing_start: "O fluxo precisa do nó de início.",
  multiple_start: "O fluxo só pode ter um nó de início.",
  too_many_nodes: "O fluxo pode ter no máximo 200 nós.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type UraActionState = { error: string | null }

async function findActor(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { userId, role: access?.role ?? null }
}

const uraFilter = (workspaceId: string, uraId: string) => ({ _id: uraId, workspaceId: new Types.ObjectId(workspaceId) })
const validId = (id: string) => (isObjectIdOrHexString(id) ? id : null)

// Cria e abre o editor da URA nova.
export async function createUraAction(workspaceId: string, _prev: UraActionState, formData: FormData): Promise<UraActionState> {
  const actor = await findActor(workspaceId)
  if (!actor) return { error: errorMessages.unauthenticated }

  const result = await createUra({ name: formData.get("name") }, { actorRole: actor.role }, async (data) => {
    const ura = await Ura.create({ ...data, workspaceId, createdBy: actor.userId })
    return { id: ura._id.toString() }
  })
  if (!result.ok) return { error: errorMessages[result.error] }
  redirect(`/workspace/${workspaceId}/uras/${result.uraId}`)
}

// graph chega do editor como JSON; a validação é toda feita em lib/ura-graph.
export async function saveUraAction(workspaceId: string, uraId: string, input: { name: string; graph: unknown }): Promise<UraActionState> {
  const actor = await findActor(workspaceId)
  if (!actor) return { error: errorMessages.unauthenticated }

  const result = await saveUra(input, { actorRole: actor.role, uraId: validId(uraId) }, async (id, data) => {
    const { matchedCount } = await Ura.updateOne(uraFilter(workspaceId, id), { $set: data })
    return matchedCount > 0
  })
  if (!result.ok) return { error: errorMessages[result.error] }
  refresh()
  return { error: null }
}

export async function setUraActiveAction(workspaceId: string, uraId: string, active: boolean): Promise<UraActionState> {
  const actor = await findActor(workspaceId)
  if (!actor) return { error: errorMessages.unauthenticated }

  const result = await setUraActive(active, { actorRole: actor.role, uraId: validId(uraId) }, async (id, value) => {
    const { matchedCount } = await Ura.updateOne(uraFilter(workspaceId, id), { $set: { active: value } })
    return matchedCount > 0
  })
  if (!result.ok) return { error: errorMessages[result.error] }
  refresh()
  return { error: null }
}

// Sessões em andamento da URA são encerradas junto.
export async function deleteUraAction(workspaceId: string, uraId: string): Promise<UraActionState> {
  const actor = await findActor(workspaceId)
  if (!actor) return { error: errorMessages.unauthenticated }

  const result = await deleteUra({ actorRole: actor.role, uraId: validId(uraId) }, async (id) => {
    const { deletedCount } = await Ura.deleteOne(uraFilter(workspaceId, id))
    if (!deletedCount) return false
    await UraSession.deleteMany({ uraId: id })
    return true
  })
  if (!result.ok) return { error: errorMessages[result.error] }
  refresh()
  return { error: null }
}

// Conversa do workspace que a função do usuário pode atender; null se não existir.
async function findInboxConversation(workspaceId: string, conversationId: string) {
  const actor = await findActor(workspaceId)
  if (!actor || !canUseInbox(actor.role) || !isObjectIdOrHexString(conversationId)) return null
  const exists = await Conversation.exists({ _id: conversationId, workspaceId: new Types.ObjectId(workspaceId) })
  return exists ? { conversationId, userId: actor.userId } : null
}

// Para a URA em andamento; a conversa fica com a equipe.
export async function stopConversationUraAction(workspaceId: string, conversationId: string) {
  const found = await findInboxConversation(workspaceId, conversationId)
  if (!found) return
  await endConversationSessions(conversationId)
  await Conversation.updateOne({ _id: conversationId }, { $set: { handedOff: true } })
  refresh()
}

// Assume a conversa: passa a ser de quem clicou e a URA para.
export async function takeConversationAction(workspaceId: string, conversationId: string) {
  const found = await findInboxConversation(workspaceId, conversationId)
  if (!found) return
  await endConversationSessions(conversationId)
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { handedOff: true, assignedUserId: new Types.ObjectId(found.userId) } },
  )
  refresh()
}

// Encerra a conversa; a próxima mensagem do cliente reabre e conta como conversa nova.
export async function closeConversationAction(workspaceId: string, conversationId: string) {
  const found = await findInboxConversation(workspaceId, conversationId)
  if (!found) return
  await endConversationSessions(conversationId)
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { status: "closed", handedOff: false, assignedUserId: null, unreadCount: 0 } },
  )
  refresh()
}
