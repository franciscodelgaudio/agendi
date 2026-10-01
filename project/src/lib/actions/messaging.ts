"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import {
  createChannel,
  deleteChannel,
  updateChannel,
  type CreateChannelError,
  type UpdateChannelError,
} from "@/service/workspace/[workspaceId]/channels/messaging-channel"
import { decryptChannelToken, encryptChannelToken, messagingEnv } from "@/service/workspace/[workspaceId]/channels/messaging-config"
import { sendReply, type ReplyConversation, type SendReplyError } from "@/service/workspace/[workspaceId]/inbox/messaging-send"
import { insertMessage, touchConversation } from "@/service/workspace/[workspaceId]/inbox/messaging-store"
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"
import { sendMetaMessage } from "@/service/workspace/[workspaceId]/channels/meta-graph"
import { endConversationSessions } from "@/service/workspace/[workspaceId]/uras/ura-store"
import { getSessionUserId } from "@/service/(auth)/session"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { Conversation } from "@/models/Conversation"
import { Message } from "@/models/Message"
import { MessagingChannel } from "@/models/MessagingChannel"

const channelErrorMessages: Record<CreateChannelError | UpdateChannelError | "unauthenticated" | "not_configured", string> = {
  workspace_not_found: "Workspace não encontrado.",
  forbidden: "Só o proprietário e administradores podem gerenciar canais.",
  invalid_input: "Preencha todos os campos.",
  invalid_platform: "Escolha WhatsApp ou Instagram.",
  invalid_name: "Informe o nome do canal.",
  name_too_long: "O nome pode ter no máximo 60 caracteres.",
  invalid_external_id: "O ID deve ter só números (entre 5 e 32 dígitos).",
  invalid_access_token: "Token de acesso inválido.",
  external_id_taken: "Este número ou conta já está conectado a um workspace.",
  channel_not_found: "Canal não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
  not_configured: "Defina MESSAGING_ENCRYPTION_KEY no ambiente para salvar tokens.",
}

const replyErrorMessages: Record<SendReplyError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado.",
  forbidden: "Sua função não pode responder conversas.",
  conversation_not_found: "Conversa não encontrada.",
  invalid_input: "Escreva uma mensagem.",
  empty_text: "Escreva uma mensagem.",
  text_too_long: "Mensagem longa demais para esta plataforma.",
  window_closed: "Passaram mais de 24h desde a última mensagem do cliente. Só é possível responder depois que ele escrever de novo.",
  channel_unavailable: "O token deste canal não pôde ser lido. Atualize o token em Canais.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type MessagingActionState = { error: string | null }

// Acesso do usuário no workspace (null sem acesso); null no lugar de tudo com sessão expirada.
async function findRole(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { userId, access: access?.actor ?? null }
}

class MissingKeyError extends Error {}

// encrypt lança sem MESSAGING_ENCRYPTION_KEY válida; vira mensagem em vez de erro 500.
function safeEncrypt(token: string) {
  try {
    return encryptChannelToken(token)
  } catch {
    throw new MissingKeyError()
  }
}

function channelInput(formData: FormData) {
  return {
    platform: formData.get("platform"),
    name: formData.get("name"),
    externalId: formData.get("externalId"),
    accessToken: formData.get("accessToken"),
  }
}

// workspaceId vem do cliente; o acesso é conferido aqui, no servidor.
export async function createChannelAction(
  workspaceId: string,
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const actor = await findRole(workspaceId)
  if (!actor) return { error: channelErrorMessages.unauthenticated }

  try {
    const result = await createChannel(channelInput(formData), { workspaceId, actor: actor.access }, {
      isExternalIdTaken: async (platform, externalId) => !!(await MessagingChannel.exists({ platform, externalId })),
      insert: async (data) => {
        const channel = await MessagingChannel.create(data)
        return { id: channel._id.toString() }
      },
      encrypt: safeEncrypt,
    })
    if (!result.ok) return { error: channelErrorMessages[result.error] }
  } catch (error) {
    if (error instanceof MissingKeyError) return { error: channelErrorMessages.not_configured }
    // Dois cadastros simultâneos do mesmo id: o índice único barra o segundo.
    if ((error as { code?: number }).code === 11000) return { error: channelErrorMessages.external_id_taken }
    throw error
  }

  refresh()
  return { error: null }
}

export async function updateChannelAction(
  workspaceId: string,
  channelId: string,
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const actor = await findRole(workspaceId)
  if (!actor) return { error: channelErrorMessages.unauthenticated }

  try {
    const result = await updateChannel(
      { name: formData.get("name"), accessToken: formData.get("accessToken") },
      { actor: actor.access, channelId: isObjectIdOrHexString(channelId) ? channelId : null },
      {
        update: async (id, data) => {
          const { matchedCount } = await MessagingChannel.updateOne({ _id: id, workspaceId }, { $set: data })
          return matchedCount > 0
        },
        encrypt: safeEncrypt,
      },
    )
    if (!result.ok) return { error: channelErrorMessages[result.error] }
  } catch (error) {
    if (error instanceof MissingKeyError) return { error: channelErrorMessages.not_configured }
    throw error
  }

  refresh()
  return { error: null }
}

// Remove também as conversas e mensagens do canal.
export async function deleteChannelAction(workspaceId: string, channelId: string): Promise<MessagingActionState> {
  const actor = await findRole(workspaceId)
  if (!actor) return { error: channelErrorMessages.unauthenticated }

  const result = await deleteChannel(
    { actor: actor.access, channelId: isObjectIdOrHexString(channelId) ? channelId : null },
    async (id) => {
      const { deletedCount } = await MessagingChannel.deleteOne({ _id: id, workspaceId })
      if (!deletedCount) return false
      const conversationIds = await Conversation.find({ channelId: id }).distinct("_id")
      await Message.deleteMany({ conversationId: { $in: conversationIds } })
      await Conversation.deleteMany({ channelId: id })
      return true
    },
  )
  if (!result.ok) return { error: channelErrorMessages[result.error] }

  refresh()
  return { error: null }
}

// Conversa do workspace com o canal e o token decriptado; null se não existir.
async function findReplyConversation(workspaceId: string, conversationId: string): Promise<ReplyConversation | null> {
  if (!isObjectIdOrHexString(conversationId)) return null
  const conversation = await Conversation.findOne({ _id: conversationId, workspaceId: new Types.ObjectId(workspaceId) }).lean()
  if (!conversation) return null
  const channel = await MessagingChannel.findById(conversation.channelId).select("+accessTokenEncrypted").lean()
  if (!channel) return null
  return {
    id: conversation._id.toString(),
    platform: conversation.platform as MessagingPlatform,
    contactExternalId: conversation.contactExternalId,
    lastInboundAt: conversation.lastInboundAt ?? null,
    channel: { externalId: channel.externalId, accessToken: decryptChannelToken(channel.accessTokenEncrypted) },
  }
}

export async function sendReplyAction(
  workspaceId: string,
  conversationId: string,
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const actor = await findRole(workspaceId)
  if (!actor) return { error: replyErrorMessages.unauthenticated }

  const conversation = can(actor.access, "inbox.use") ? await findReplyConversation(workspaceId, conversationId) : null
  const result = await sendReply(
    { text: formData.get("text") },
    { workspaceId, userId: actor.userId, actor: actor.access, conversation },
    {
      now: () => new Date(),
      insertMessage: async (data) => (await insertMessage(data))!,
      touchConversation,
      send: (params) => sendMetaMessage({ ...params, apiVersion: messagingEnv.graphApiVersion() }),
      markSent: async (id, externalMessageId) => {
        await Message.updateOne({ _id: id, status: "pending" }, { $set: { status: "sent", externalMessageId } })
      },
      markFailed: async (id, detail) => {
        await Message.updateOne({ _id: id }, { $set: { status: "failed", error: detail } })
      },
    },
  )

  // Quem responde assume a conversa: a URA para e a conversa fica com essa pessoa, se ainda não tinha ninguém.
  if (result.ok) {
    await endConversationSessions(conversationId)
    await Conversation.updateOne({ _id: conversationId }, { $set: { handedOff: true, status: "open" } })
    await Conversation.updateOne(
      { _id: conversationId, assignedUserId: null },
      { $set: { assignedUserId: new Types.ObjectId(actor.userId) } },
    )
  }

  // Falha no envio já aparece na própria mensagem, marcada como não enviada.
  refresh()
  if (!result.ok && result.error !== "send_failed") return { error: replyErrorMessages[result.error] }
  return { error: null }
}

export async function markConversationReadAction(workspaceId: string, conversationId: string) {
  const actor = await findRole(workspaceId)
  if (!actor || !can(actor.access, "inbox.use") || !isObjectIdOrHexString(conversationId)) return
  const { modifiedCount } = await Conversation.updateOne(
    { _id: conversationId, workspaceId: new Types.ObjectId(workspaceId), unreadCount: { $gt: 0 } },
    { $set: { unreadCount: 0 } },
  )
  if (modifiedCount) refresh()
}
