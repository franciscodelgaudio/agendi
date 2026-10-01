import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import type { SendMessageParams, SendMessageResult } from "@/service/workspace/[workspaceId]/channels/meta-graph";
import { messagePreview, type ConversationTouch, type StoredMessage } from "@/service/workspace/[workspaceId]/inbox/messaging-inbox";
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types";

// A Meta só permite mensagem livre até 24h depois da última mensagem do cliente.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MAX_TEXT_LENGTH: Record<MessagingPlatform, number> = { whatsapp: 4096, instagram: 1000 };

export function isReplyWindowOpen(lastInboundAt: Date | null, now: Date) {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() <= REPLY_WINDOW_MS;
}

export type ReplyConversation = {
  id: string;
  platform: MessagingPlatform;
  contactExternalId: string;
  lastInboundAt: Date | null;
  // accessToken null = não foi possível decriptar o token salvo.
  channel: { externalId: string; accessToken: string | null };
};

export type SendReplyError =
  | "workspace_not_found"
  | "forbidden"
  | "conversation_not_found"
  | "invalid_input"
  | "empty_text"
  | "text_too_long"
  | "window_closed"
  | "channel_unavailable";

export type SendReplyResult =
  | { ok: true; messageId: string }
  | { ok: false; error: SendReplyError }
  | { ok: false; error: "send_failed"; detail: string | null };

export async function sendReply(
  input: unknown,
  ctx: {
    workspaceId: string;
    userId: string;
    actor: Actor | null;
    conversation: ReplyConversation | null;
  },
  deps: {
    now: () => Date;
    insertMessage: (data: StoredMessage & { sentByUserId: string }) => Promise<{ id: string }>;
    touchConversation: (conversationId: string, data: ConversationTouch) => Promise<void>;
    send: (params: Omit<SendMessageParams, "apiVersion">) => Promise<SendMessageResult>;
    markSent: (messageId: string, externalMessageId: string) => Promise<void>;
    markFailed: (messageId: string, detail: string | null) => Promise<void>;
  },
): Promise<SendReplyResult> {
  if (!ctx.actor) return { ok: false, error: "workspace_not_found" };
  if (!can(ctx.actor, "inbox.use")) return { ok: false, error: "forbidden" };
  const { conversation } = ctx;
  if (!conversation) return { ok: false, error: "conversation_not_found" };

  const { text } = (input ?? {}) as Record<string, unknown>;
  if (typeof text !== "string") return { ok: false, error: "invalid_input" };
  const body = text.trim();
  if (!body) return { ok: false, error: "empty_text" };
  if (body.length > MAX_TEXT_LENGTH[conversation.platform]) return { ok: false, error: "text_too_long" };

  const now = deps.now();
  if (!isReplyWindowOpen(conversation.lastInboundAt, now)) return { ok: false, error: "window_closed" };
  const { accessToken } = conversation.channel;
  if (!accessToken) return { ok: false, error: "channel_unavailable" };

  // Salva antes de enviar para a mensagem nunca sair sem registro.
  const message = await deps.insertMessage({
    workspaceId: ctx.workspaceId,
    conversationId: conversation.id,
    direction: "outbound",
    externalMessageId: null,
    type: "text",
    text: body,
    status: "pending",
    sentAt: now,
    sentByUserId: ctx.userId,
  });
  await deps.touchConversation(conversation.id, {
    lastMessageAt: now,
    lastMessagePreview: messagePreview("text", body),
    inbound: false,
  });

  const result = await deps.send({
    platform: conversation.platform,
    channelExternalId: conversation.channel.externalId,
    accessToken,
    to: conversation.contactExternalId,
    text: body,
  });
  if (!result.ok) {
    await deps.markFailed(message.id, result.detail);
    return { ok: false, error: "send_failed", detail: result.detail };
  }

  await deps.markSent(message.id, result.externalMessageId);
  return { ok: true, messageId: message.id };
}
