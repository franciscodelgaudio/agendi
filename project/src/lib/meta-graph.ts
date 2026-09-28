import type { MessagingPlatform } from "@/lib/messaging-types";

export type SendMessageParams = {
  platform: MessagingPlatform;
  channelExternalId: string;
  accessToken: string;
  to: string;
  apiVersion: string;
  text?: string;
  // Corpo já montado (lib/meta-message): mídia, menu interativo etc. Tem prioridade sobre text.
  body?: Record<string, unknown>;
};

export type SendMessageResult =
  | { ok: true; externalMessageId: string }
  | { ok: false; reason: "api_error" | "network_error" | "unexpected_response"; detail: string | null };

// WhatsApp: Cloud API do número (graph.facebook.com). Instagram: API com login do
// Instagram (graph.instagram.com), com o token da conta profissional.
function buildRequest({ platform, channelExternalId, accessToken, to, text, body: ready, apiVersion }: SendMessageParams) {
  const host = platform === "whatsapp" ? "graph.facebook.com" : "graph.instagram.com";
  const body =
    ready ??
    (platform === "whatsapp"
      ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } }
      : { recipient: { id: to }, message: { text } });
  return {
    url: `https://${host}/${apiVersion}/${channelExternalId}/messages`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

function messageId(platform: MessagingPlatform, body: unknown) {
  const data = (body ?? {}) as Record<string, unknown>;
  const id =
    platform === "whatsapp"
      ? (Array.isArray(data.messages) ? (data.messages[0] as Record<string, unknown> | undefined) : undefined)?.id
      : data.message_id;
  return typeof id === "string" && id ? id : null;
}

export async function sendMetaMessage(
  params: SendMessageParams,
  fetchFn: typeof fetch = fetch,
): Promise<SendMessageResult> {
  const { url, init } = buildRequest(params);
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    return { ok: false, reason: "network_error", detail: null };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { message?: unknown } } | null)?.error;
    const detail = typeof error?.message === "string" && error.message ? error.message : null;
    return { ok: false, reason: "api_error", detail };
  }

  const id = messageId(params.platform, body);
  return id ? { ok: true, externalMessageId: id } : { ok: false, reason: "unexpected_response", detail: null };
}
