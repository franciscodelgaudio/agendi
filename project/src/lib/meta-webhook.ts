import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus, MessageDirection, MessageType, MessagingPlatform } from "@/lib/messaging-types";

export type MessageEvent = {
  kind: "message";
  platform: MessagingPlatform;
  // WhatsApp: phone_number_id do número. Instagram: id da conta profissional.
  channelExternalId: string;
  // WhatsApp: wa_id do cliente. Instagram: id do cliente no escopo da conta (IGSID).
  contactExternalId: string;
  contactName: string | null;
  externalMessageId: string;
  // outbound = eco de mensagem que a conta enviou direto pelo app do Instagram.
  direction: MessageDirection;
  type: MessageType;
  text: string | null;
  sentAt: Date;
  // Id da opção de menu (botão, lista ou resposta rápida) que o cliente tocou.
  optionId?: string;
};

export type StatusEvent = {
  kind: "status";
  platform: MessagingPlatform;
  channelExternalId: string;
  externalMessageId: string;
  status: Exclude<DeliveryStatus, "pending">;
  at: Date;
  error: string | null;
};

export type WebhookEvent = MessageEvent | StatusEvent;

// GET de verificação que a Meta faz ao cadastrar o webhook: devolve o challenge
// para ecoar na resposta, ou null para responder 403.
export function verifyWebhookSubscription(params: Record<string, string | undefined>, verifyToken: string | undefined) {
  if (!verifyToken) return null;
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = params;
  if (mode !== "subscribe" || token !== verifyToken || !challenge) return null;
  return challenge;
}

// X-Hub-Signature-256: HMAC-SHA256 do corpo cru com o segredo do app. WhatsApp e
// Instagram podem vir de apps com segredos diferentes, então vale qualquer um configurado.
export function isValidWebhookSignature(
  rawBody: string,
  header: string | null,
  secrets: (string | undefined)[],
) {
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice("sha256=".length), "utf8");
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown) => (typeof value === "string" && value ? value : null);

// WhatsApp manda segundos como string; Instagram, milissegundos como número.
function secondsToDate(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? new Date(Number(value) * 1000) : null;
}
function millisToDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value) : null;
}

const WHATSAPP_STATUSES = ["sent", "delivered", "read", "failed"] as const;
const WHATSAPP_MEDIA: Partial<Record<string, MessageType>> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  sticker: "sticker",
};
const INSTAGRAM_ATTACHMENTS: Partial<Record<string, MessageType>> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
};

// Toque em botão ou lista de mensagem interativa, ou botão de resposta rápida de template.
function whatsappReply(message: Json): { id: string; title: string } | null {
  if (message.type === "button" && isObject(message.button)) {
    const id = asString(message.button.payload);
    const title = asString(message.button.text);
    return id && title ? { id, title } : null;
  }
  if (message.type !== "interactive" || !isObject(message.interactive)) return null;
  const { type, button_reply: button, list_reply: list } = message.interactive;
  const choice = type === "button_reply" ? button : type === "list_reply" ? list : null;
  if (!isObject(choice)) return null;
  const id = asString(choice.id);
  const title = asString(choice.title);
  return id && title ? { id, title } : null;
}

function whatsappMessage(message: unknown, channelExternalId: string, names: Map<string, string>): MessageEvent | null {
  if (!isObject(message)) return null;
  const from = asString(message.from);
  const id = asString(message.id);
  const sentAt = secondsToDate(message.timestamp);
  if (!from || !id || !sentAt) return null;

  const waType = asString(message.type) ?? "";
  let type: MessageType = WHATSAPP_MEDIA[waType] ?? "other";
  let text: string | null = null;
  let optionId: string | null = null;
  const reply = whatsappReply(message);
  if (reply) {
    type = "text";
    text = reply.title;
    optionId = reply.id;
  } else if (waType === "text") {
    type = "text";
    text = isObject(message.text) ? asString(message.text.body) : null;
  } else if (type !== "other") {
    const content = message[waType];
    text = isObject(content) ? asString(content.caption) : null;
  }

  return {
    kind: "message",
    platform: "whatsapp",
    channelExternalId,
    contactExternalId: from,
    contactName: names.get(from) ?? null,
    externalMessageId: id,
    direction: "inbound",
    type,
    text,
    sentAt,
    ...(optionId ? { optionId } : {}),
  };
}

function whatsappStatus(status: unknown, channelExternalId: string): StatusEvent | null {
  if (!isObject(status)) return null;
  const id = asString(status.id);
  const at = secondsToDate(status.timestamp);
  const value = WHATSAPP_STATUSES.find((s) => s === status.status);
  if (!id || !at || !value) return null;
  const [firstError] = asArray(status.errors);
  const error = isObject(firstError) ? (asString(firstError.message) ?? asString(firstError.title)) : null;
  return { kind: "status", platform: "whatsapp", channelExternalId, externalMessageId: id, status: value, at, error };
}

function parseWhatsapp(entries: unknown[]): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isObject(change) || change.field !== "messages" || !isObject(change.value)) continue;
      const { metadata, contacts, messages, statuses } = change.value;
      const channelExternalId = isObject(metadata) ? asString(metadata.phone_number_id) : null;
      if (!channelExternalId) continue;

      const names = new Map<string, string>();
      for (const contact of asArray(contacts)) {
        if (!isObject(contact)) continue;
        const waId = asString(contact.wa_id);
        const name = isObject(contact.profile) ? asString(contact.profile.name) : null;
        if (waId && name) names.set(waId, name);
      }

      for (const message of asArray(messages)) {
        const event = whatsappMessage(message, channelExternalId, names);
        if (event) events.push(event);
      }
      for (const status of asArray(statuses)) {
        const event = whatsappStatus(status, channelExternalId);
        if (event) events.push(event);
      }
    }
  }
  return events;
}

function instagramEvent(item: unknown, channelExternalId: string): WebhookEvent | null {
  if (!isObject(item)) return null;
  const senderId = isObject(item.sender) ? asString(item.sender.id) : null;
  const recipientId = isObject(item.recipient) ? asString(item.recipient.id) : null;
  const at = millisToDate(item.timestamp);
  if (!senderId || !recipientId || !at) return null;

  if (isObject(item.read)) {
    const mid = asString(item.read.mid);
    if (!mid) return null;
    return { kind: "status", platform: "instagram", channelExternalId, externalMessageId: mid, status: "read", at, error: null };
  }

  if (!isObject(item.message)) return null;
  const { mid, text, attachments, is_echo: isEcho, is_deleted: isDeleted } = item.message;
  const id = asString(mid);
  if (!id || isDeleted === true) return null;

  const [attachment] = asArray(attachments);
  const body = asString(text);
  let type: MessageType = body ? "text" : "other";
  if (isObject(attachment)) type = INSTAGRAM_ATTACHMENTS[asString(attachment.type) ?? ""] ?? "other";

  const outbound = isEcho === true;
  const optionId = isObject(item.message.quick_reply) ? asString(item.message.quick_reply.payload) : null;
  return {
    kind: "message",
    platform: "instagram",
    channelExternalId,
    contactExternalId: outbound ? recipientId : senderId,
    contactName: null,
    externalMessageId: id,
    direction: outbound ? "outbound" : "inbound",
    type,
    text: body,
    sentAt: at,
    ...(optionId && body ? { optionId } : {}),
  };
}

function parseInstagram(entries: unknown[]): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const channelExternalId = asString(entry.id);
    if (!channelExternalId) continue;
    for (const item of asArray(entry.messaging)) {
      const event = instagramEvent(item, channelExternalId);
      if (event) events.push(event);
    }
  }
  return events;
}

// Normaliza o corpo do webhook da Meta (WhatsApp Cloud API ou Instagram) em eventos.
// Itens malformados ou de tipos que o sistema não trata são descartados.
export function parseMetaWebhook(payload: unknown): WebhookEvent[] {
  if (!isObject(payload) || !Array.isArray(payload.entry)) return [];
  if (payload.object === "whatsapp_business_account") return parseWhatsapp(payload.entry);
  if (payload.object === "instagram") return parseInstagram(payload.entry);
  return [];
}
