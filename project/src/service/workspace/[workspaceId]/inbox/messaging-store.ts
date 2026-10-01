import { Types } from "mongoose"
import type { ConversationTouch, StoredMessage } from "@/service/workspace/[workspaceId]/inbox/messaging-inbox"
import type { DeliveryStatus, MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"
import { Conversation } from "@/models/Conversation"
import { Message } from "@/models/Message"
import { MessagingChannel } from "@/models/MessagingChannel"

// Implementações no banco das dependências de lib/messaging-inbox e lib/messaging-send,
// compartilhadas pelo webhook e pelas server actions.

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export async function findChannelByExternalId(platform: MessagingPlatform, externalId: string) {
  const channel = await MessagingChannel.findOne({ platform, externalId }).select("_id workspaceId").lean()
  return channel ? { id: channel._id.toString(), workspaceId: channel.workspaceId.toString() } : null
}

export async function upsertConversation(data: {
  workspaceId: string
  channelId: string
  platform: MessagingPlatform
  contactExternalId: string
  contactName: string | null
}) {
  const filter = { channelId: data.channelId, contactExternalId: data.contactExternalId }
  const update = {
    $setOnInsert: { workspaceId: data.workspaceId, platform: data.platform },
    ...(data.contactName ? { $set: { contactName: data.contactName } } : {}),
  }
  const upsert = () =>
    Conversation.findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after" }).select("_id").lean()
  // Duas mensagens do mesmo contato chegando juntas podem disputar o upsert; a segunda tenta de novo.
  const conversation = await upsert().catch((error) => {
    if (isDuplicateKey(error)) return upsert()
    throw error
  })
  return { id: conversation!._id.toString() }
}

// false quando a mensagem já existe (reenvio do webhook).
export async function insertMessage(
  data: StoredMessage & {
    sentByUserId?: string
    // Mensagens da URA: quem enviou, link da mídia e opções do menu.
    sentByUraId?: string
    mediaUrl?: string | null
    options?: { title: string; description: string | null }[]
  },
) {
  try {
    const message = await Message.create(data)
    return { id: message._id.toString() }
  } catch (error) {
    if (isDuplicateKey(error)) return null
    throw error
  }
}

// Prévia e data só avançam: um webhook atrasado não sobrescreve a última mensagem.
export async function touchConversation(conversationId: string, { lastMessageAt, lastMessagePreview, inbound }: ConversationTouch) {
  await Conversation.updateOne(
    { _id: conversationId, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: lastMessageAt } }] },
    { $set: { lastMessageAt, lastMessagePreview } },
  )
  if (inbound) {
    await Conversation.updateOne({ _id: conversationId }, { $inc: { unreadCount: 1 }, $max: { lastInboundAt: lastMessageAt } })
  }
}

export async function updateOutboundStatus(
  workspaceId: string,
  { externalMessageId, status, error, from }: { externalMessageId: string; status: DeliveryStatus; error: string | null; from: DeliveryStatus[] },
) {
  await Message.updateOne(
    { workspaceId: new Types.ObjectId(workspaceId), externalMessageId, direction: "outbound", status: { $in: from } },
    { $set: { status, error } },
  )
}
