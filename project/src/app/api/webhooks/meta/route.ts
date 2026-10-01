import { messagingEnv } from "@/service/workspace/[workspaceId]/channels/messaging-config"
import { ingestWebhookEvents } from "@/service/workspace/[workspaceId]/inbox/messaging-inbox"
import {
  findChannelByExternalId,
  insertMessage,
  touchConversation,
  updateOutboundStatus,
  upsertConversation,
} from "@/service/workspace/[workspaceId]/inbox/messaging-store"
import { isValidWebhookSignature, parseMetaWebhook, verifyWebhookSubscription } from "@/service/api/webhooks/meta/meta-webhook"
import { enqueueInbound } from "@/service/workspace/[workspaceId]/uras/ura-queue"
import { Conversation } from "@/models/Conversation"
import { Message } from "@/models/Message"

// Webhook único da Meta para WhatsApp Cloud API e Instagram. Fica fora do login
// (proxy.ts); a autenticidade vem do token de verificação (GET) e da assinatura (POST).

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const challenge = verifyWebhookSubscription(params, messagingEnv.verifyToken())
  return challenge ? new Response(challenge, { status: 200 }) : new Response("Forbidden", { status: 403 })
}

export async function POST(request: Request) {
  // A assinatura é sobre o corpo cru, então ele é lido como texto antes do JSON.
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  if (!isValidWebhookSignature(rawBody, signature, messagingEnv.appSecrets())) {
    return new Response("Invalid signature", { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  // Workspace de cada canal encontrado, para limitar a atualização de status a ele.
  const channelWorkspaces = new Map<string, string>()
  await ingestWebhookEvents(parseMetaWebhook(payload), {
    findChannel: async (platform, externalId) => {
      const channel = await findChannelByExternalId(platform, externalId)
      if (channel) channelWorkspaces.set(channel.id, channel.workspaceId)
      return channel
    },
    upsertConversation,
    insertMessage: async (data) => (await insertMessage(data)) !== null,
    touchConversation,
    updateMessageStatus: ({ channelId, ...data }) => updateOutboundStatus(channelWorkspaces.get(channelId)!, data),
    onInbound: async ({ conversationId, text, optionId }) => {
      // Conversa nova (primeira mensagem do cliente) ou reaberta: vale o gatilho de conversa nova.
      const reopened = await Conversation.updateOne({ _id: conversationId, status: "closed" }, { $set: { status: "open" } })
      const isNewConversation =
        reopened.modifiedCount > 0 || (await Message.countDocuments({ conversationId, direction: "inbound" })) === 1
      await enqueueInbound({ conversationId, text, optionId, isNewConversation })
    },
  })

  // Erro ao gravar sobe como 500 e a Meta reenvia; mensagens repetidas são ignoradas.
  return new Response("EVENT_RECEIVED", { status: 200 })
}
