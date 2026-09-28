import type { WebhookEvent } from "@/lib/meta-webhook";
import type { DeliveryStatus, MessageDirection, MessageType, MessagingPlatform } from "@/lib/messaging-types";

const MAX_PREVIEW_LENGTH = 100;

export const messageTypeLabels: Record<MessageType, string> = {
  text: "Mensagem",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
  sticker: "Figurinha",
  other: "Mensagem",
};

// Prévia da última mensagem na lista de conversas: uma linha só, ou o rótulo da mídia.
export function messagePreview(type: MessageType, text: string | null) {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return messageTypeLabels[type];
  return line.length > MAX_PREVIEW_LENGTH ? `${line.slice(0, MAX_PREVIEW_LENGTH)}…` : line;
}

const STATUS_ORDER: DeliveryStatus[] = ["pending", "sent", "delivered", "read"];

// Status que um novo status pode substituir. Webhooks chegam fora de ordem, então
// um "delivered" atrasado não pode desfazer um "read"; "failed" só vale antes da entrega.
export function statusesBefore(status: Exclude<DeliveryStatus, "pending">): DeliveryStatus[] {
  if (status === "failed") return ["pending", "sent"];
  return STATUS_ORDER.slice(0, STATUS_ORDER.indexOf(status));
}

export type StoredMessage = {
  workspaceId: string;
  conversationId: string;
  direction: MessageDirection;
  externalMessageId: string | null;
  type: MessageType;
  text: string | null;
  status: DeliveryStatus | null;
  sentAt: Date;
};

export type ConversationTouch = { lastMessageAt: Date; lastMessagePreview: string; inbound: boolean };

type IngestDeps = {
  findChannel: (platform: MessagingPlatform, externalId: string) => Promise<{ id: string; workspaceId: string } | null>;
  // Cria a conversa do contato no canal se ainda não existir; contactName null não sobrescreve.
  upsertConversation: (data: {
    workspaceId: string;
    channelId: string;
    platform: MessagingPlatform;
    contactExternalId: string;
    contactName: string | null;
  }) => Promise<{ id: string }>;
  // false quando a mensagem já existe (a Meta reenvia webhooks).
  insertMessage: (data: StoredMessage) => Promise<boolean>;
  touchConversation: (conversationId: string, data: ConversationTouch) => Promise<void>;
  updateMessageStatus: (data: {
    channelId: string;
    externalMessageId: string;
    status: Exclude<DeliveryStatus, "pending">;
    error: string | null;
    from: DeliveryStatus[];
  }) => Promise<void>;
  // Chamado para cada mensagem recebida nova, depois de atualizar a conversa (dispara a URA).
  onInbound?: (data: InboundNotice) => Promise<void>;
};

export type InboundNotice = {
  workspaceId: string;
  channelId: string;
  conversationId: string;
  text: string;
  optionId: string | null;
};

// Grava os eventos do webhook. Eventos de canais não conectados e mensagens
// repetidas contam como skipped.
export async function ingestWebhookEvents(events: WebhookEvent[], deps: IngestDeps) {
  const result = { messages: 0, statuses: 0, skipped: 0 };

  for (const event of events) {
    const channel = await deps.findChannel(event.platform, event.channelExternalId);
    if (!channel) {
      result.skipped++;
      continue;
    }

    if (event.kind === "status") {
      await deps.updateMessageStatus({
        channelId: channel.id,
        externalMessageId: event.externalMessageId,
        status: event.status,
        error: event.error,
        from: statusesBefore(event.status),
      });
      result.statuses++;
      continue;
    }

    const conversation = await deps.upsertConversation({
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      platform: event.platform,
      contactExternalId: event.contactExternalId,
      contactName: event.contactName,
    });
    const inbound = event.direction === "inbound";
    const inserted = await deps.insertMessage({
      workspaceId: channel.workspaceId,
      conversationId: conversation.id,
      direction: event.direction,
      externalMessageId: event.externalMessageId,
      type: event.type,
      text: event.text,
      status: inbound ? null : "sent",
      sentAt: event.sentAt,
    });
    if (!inserted) {
      result.skipped++;
      continue;
    }

    await deps.touchConversation(conversation.id, {
      lastMessageAt: event.sentAt,
      lastMessagePreview: messagePreview(event.type, event.text),
      inbound,
    });
    if (inbound) {
      await deps.onInbound?.({
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        conversationId: conversation.id,
        text: event.text ?? "",
        optionId: event.optionId ?? null,
      });
    }
    result.messages++;
  }

  return result;
}
