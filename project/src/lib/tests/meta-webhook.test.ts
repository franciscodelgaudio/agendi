import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { isValidWebhookSignature, parseMetaWebhook, verifyWebhookSubscription } from "@/service/api/webhooks/meta/meta-webhook";

const VERIFY_TOKEN = "meu-token-de-verificacao";
const APP_SECRET = "segredo-do-app-meta";
const INSTAGRAM_SECRET = "segredo-do-app-instagram";

const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyWebhookSubscription", () => {
  const params = { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444" };

  it("devolve o challenge quando o modo e o token conferem", () => {
    expect(verifyWebhookSubscription(params, VERIFY_TOKEN)).toBe("1158201444");
  });

  it.each([
    ["token errado", { ...params, "hub.verify_token": "outro" }],
    ["modo diferente de subscribe", { ...params, "hub.mode": "unsubscribe" }],
    ["sem modo", { "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444" }],
    ["sem challenge", { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN }],
    ["challenge vazio", { ...params, "hub.challenge": "" }],
  ])("devolve null com %s", (_label, query) => {
    expect(verifyWebhookSubscription(query, VERIFY_TOKEN)).toBeNull();
  });

  it.each([undefined, ""])("devolve null quando o token não está configurado (%j), mesmo se a query vier vazia", (token) => {
    expect(verifyWebhookSubscription({ ...params, "hub.verify_token": "" }, token)).toBeNull();
    expect(verifyWebhookSubscription({ "hub.mode": "subscribe", "hub.challenge": "1" }, token)).toBeNull();
  });
});

describe("isValidWebhookSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("aceita a assinatura feita com o segredo configurado", () => {
    expect(isValidWebhookSignature(body, sign(body, APP_SECRET), [APP_SECRET])).toBe(true);
  });

  it("aceita a assinatura feita com qualquer um dos segredos configurados", () => {
    expect(isValidWebhookSignature(body, sign(body, INSTAGRAM_SECRET), [APP_SECRET, INSTAGRAM_SECRET])).toBe(true);
  });

  it("ignora segredos não configurados na lista", () => {
    expect(isValidWebhookSignature(body, sign(body, APP_SECRET), [undefined, "", APP_SECRET])).toBe(true);
  });

  it.each([
    ["segredo errado", sign(body, "outro-segredo")],
    ["sem o prefixo sha256=", sign(body, APP_SECRET).slice("sha256=".length)],
    ["assinatura de outro corpo", sign(body + " ", APP_SECRET)],
    ["assinatura truncada", sign(body, APP_SECRET).slice(0, -2)],
    ["header vazio", ""],
    ["header ausente", null],
  ])("recusa com %s", (_label, header) => {
    expect(isValidWebhookSignature(body, header, [APP_SECRET])).toBe(false);
  });

  it.each([[[]], [[undefined, ""]]])("recusa quando nenhum segredo está configurado (%j)", (secrets) => {
    expect(isValidWebhookSignature(body, sign(body, ""), secrets)).toBe(false);
  });
});

// Formato do webhook da WhatsApp Cloud API: timestamps em segundos (string).
function whatsappPayload(value: Record<string, unknown>, field = "messages") {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "102290129340398", changes: [{ field, value: { messaging_product: "whatsapp", ...value } }] }],
  };
}

const WA_METADATA = { display_phone_number: "5511999990000", phone_number_id: "106540352242922" };
const WA_CONTACT = { profile: { name: "Maria Souza" }, wa_id: "5511988887777" };

// Formato do webhook do Instagram (API com login do Instagram): timestamps em milissegundos.
function instagramPayload(messaging: unknown[]) {
  return { object: "instagram", entry: [{ id: "17841400000000001", time: 1790000000000, messaging }] };
}

describe("parseMetaWebhook · WhatsApp", () => {
  it("converte uma mensagem de texto recebida, com o nome do contato", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      contacts: [WA_CONTACT],
      messages: [
        { from: "5511988887777", id: "wamid.AAA", timestamp: "1790000000", type: "text", text: { body: "Oi, tem horário amanhã?" } },
      ],
    });

    expect(parseMetaWebhook(payload)).toEqual([
      {
        kind: "message",
        platform: "whatsapp",
        channelExternalId: "106540352242922",
        contactExternalId: "5511988887777",
        contactName: "Maria Souza",
        externalMessageId: "wamid.AAA",
        direction: "inbound",
        type: "text",
        text: "Oi, tem horário amanhã?",
        sentAt: new Date(1790000000 * 1000),
      },
    ]);
  });

  it.each([
    ["image", { image: { id: "m1", mime_type: "image/jpeg", caption: "Olha a foto" } }, "image", "Olha a foto"],
    ["image", { image: { id: "m1", mime_type: "image/jpeg" } }, "image", null],
    ["video", { video: { id: "m1", caption: "Vídeo" } }, "video", "Vídeo"],
    ["document", { document: { id: "m1", filename: "a.pdf", caption: "Contrato" } }, "document", "Contrato"],
    ["audio", { audio: { id: "m1", voice: true } }, "audio", null],
    ["sticker", { sticker: { id: "m1" } }, "sticker", null],
    ["location", { location: { latitude: 1, longitude: 2 } }, "other", null],
    ["reaction", { reaction: { message_id: "wamid.X", emoji: "👍" } }, "other", null],
    ["unsupported", {}, "other", null],
  ])("converte mensagem do tipo %s", (waType, content, type, text) => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      contacts: [WA_CONTACT],
      messages: [{ from: "5511988887777", id: "wamid.AAA", timestamp: "1790000000", type: waType, ...content }],
    });

    expect(parseMetaWebhook(payload)).toEqual([expect.objectContaining({ type, text })]);
  });

  it("usa o nome do contato de cada remetente e null quando não vem", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      contacts: [WA_CONTACT],
      messages: [
        { from: "5511988887777", id: "wamid.A", timestamp: "1790000000", type: "text", text: { body: "1" } },
        { from: "5511911112222", id: "wamid.B", timestamp: "1790000001", type: "text", text: { body: "2" } },
      ],
    });

    expect(parseMetaWebhook(payload).map((e) => e.kind === "message" && e.contactName)).toEqual(["Maria Souza", null]);
  });

  it("junta as mensagens de várias entradas e mudanças, na ordem", () => {
    const message = (id: string) => ({ from: "5511988887777", id, timestamp: "1790000000", type: "text", text: { body: id } });
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1",
          changes: [
            { field: "messages", value: { metadata: WA_METADATA, messages: [message("wamid.A")] } },
            { field: "messages", value: { metadata: WA_METADATA, messages: [message("wamid.B")] } },
          ],
        },
        { id: "2", changes: [{ field: "messages", value: { metadata: WA_METADATA, messages: [message("wamid.C")] } }] },
      ],
    };

    expect(parseMetaWebhook(payload).map((e) => e.externalMessageId)).toEqual(["wamid.A", "wamid.B", "wamid.C"]);
  });

  it.each(["sent", "delivered", "read"] as const)("converte o status %s de uma mensagem enviada", (status) => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      statuses: [{ id: "wamid.OUT", status, timestamp: "1790000100", recipient_id: "5511988887777" }],
    });

    expect(parseMetaWebhook(payload)).toEqual([
      {
        kind: "status",
        platform: "whatsapp",
        channelExternalId: "106540352242922",
        externalMessageId: "wamid.OUT",
        status,
        at: new Date(1790000100 * 1000),
        error: null,
      },
    ]);
  });

  it("converte o status failed com a descrição do erro", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      statuses: [
        {
          id: "wamid.OUT",
          status: "failed",
          timestamp: "1790000100",
          recipient_id: "5511988887777",
          errors: [{ code: 131047, title: "Re-engagement message", message: "Message failed to send because more than 24 hours have passed" }],
        },
      ],
    });

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({
        kind: "status",
        status: "failed",
        error: "Message failed to send because more than 24 hours have passed",
      }),
    ]);
  });

  it("usa o título do erro quando não há mensagem detalhada", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      statuses: [{ id: "wamid.OUT", status: "failed", timestamp: "1790000100", errors: [{ code: 1, title: "Erro X" }] }],
    });

    expect(parseMetaWebhook(payload)).toEqual([expect.objectContaining({ status: "failed", error: "Erro X" })]);
  });

  it("ignora status desconhecidos", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      statuses: [{ id: "wamid.OUT", status: "deleted", timestamp: "1790000100" }],
    });

    expect(parseMetaWebhook(payload)).toEqual([]);
  });

  it("ignora mudanças de outros campos (ex.: templates)", () => {
    const payload = whatsappPayload({ event: "APPROVED", message_template_id: 1 }, "message_template_status_update");

    expect(parseMetaWebhook(payload)).toEqual([]);
  });

  it("descarta itens malformados e mantém os válidos", () => {
    const payload = whatsappPayload({
      metadata: WA_METADATA,
      messages: [
        { id: "wamid.SEM_FROM", timestamp: "1790000000", type: "text", text: { body: "x" } },
        { from: "5511988887777", timestamp: "1790000000", type: "text", text: { body: "sem id" } },
        { from: "5511988887777", id: "wamid.DATA_RUIM", timestamp: "abc", type: "text", text: { body: "x" } },
        { from: "5511988887777", id: "wamid.OK", timestamp: "1790000000", type: "text", text: { body: "ok" } },
      ],
      statuses: [{ status: "read", timestamp: "1790000100" }],
    });

    expect(parseMetaWebhook(payload).map((e) => e.externalMessageId)).toEqual(["wamid.OK"]);
  });

  it("descarta a mudança inteira quando falta o phone_number_id", () => {
    const payload = whatsappPayload({
      metadata: { display_phone_number: "5511999990000" },
      messages: [{ from: "5511988887777", id: "wamid.A", timestamp: "1790000000", type: "text", text: { body: "x" } }],
    });

    expect(parseMetaWebhook(payload)).toEqual([]);
  });
});

describe("parseMetaWebhook · Instagram", () => {
  it("converte uma mensagem de texto recebida", () => {
    const payload = instagramPayload([
      {
        sender: { id: "6000000000000001" },
        recipient: { id: "17841400000000001" },
        timestamp: 1790000000123,
        message: { mid: "aWdfZAG1faXRlbToxOklH", text: "Quanto custa a massagem?" },
      },
    ]);

    expect(parseMetaWebhook(payload)).toEqual([
      {
        kind: "message",
        platform: "instagram",
        channelExternalId: "17841400000000001",
        contactExternalId: "6000000000000001",
        contactName: null,
        externalMessageId: "aWdfZAG1faXRlbToxOklH",
        direction: "inbound",
        type: "text",
        text: "Quanto custa a massagem?",
        sentAt: new Date(1790000000123),
      },
    ]);
  });

  it("converte o eco de uma mensagem enviada pela conta como saída, com o contato no destinatário", () => {
    const payload = instagramPayload([
      {
        sender: { id: "17841400000000001" },
        recipient: { id: "6000000000000001" },
        timestamp: 1790000000123,
        message: { mid: "mid.ECHO", text: "Custa R$ 200", is_echo: true },
      },
    ]);

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({
        kind: "message",
        channelExternalId: "17841400000000001",
        contactExternalId: "6000000000000001",
        direction: "outbound",
        text: "Custa R$ 200",
      }),
    ]);
  });

  it.each([
    ["image", "image"],
    ["video", "video"],
    ["audio", "audio"],
    ["file", "document"],
    ["share", "other"],
    ["story_mention", "other"],
  ])("converte anexo do tipo %s em %s", (attachmentType, type) => {
    const payload = instagramPayload([
      {
        sender: { id: "6000000000000001" },
        recipient: { id: "17841400000000001" },
        timestamp: 1790000000123,
        message: { mid: "mid.ANEXO", attachments: [{ type: attachmentType, payload: { url: "https://cdn/x" } }] },
      },
    ]);

    expect(parseMetaWebhook(payload)).toEqual([expect.objectContaining({ type, text: null })]);
  });

  it("converte a confirmação de leitura em status read", () => {
    const payload = instagramPayload([
      {
        sender: { id: "6000000000000001" },
        recipient: { id: "17841400000000001" },
        timestamp: 1790000000500,
        read: { mid: "mid.OUT" },
      },
    ]);

    expect(parseMetaWebhook(payload)).toEqual([
      {
        kind: "status",
        platform: "instagram",
        channelExternalId: "17841400000000001",
        externalMessageId: "mid.OUT",
        status: "read",
        at: new Date(1790000000500),
        error: null,
      },
    ]);
  });

  it("ignora mensagens apagadas, reações e itens malformados", () => {
    const payload = instagramPayload([
      { sender: { id: "6000000000000001" }, recipient: { id: "17841400000000001" }, timestamp: 1790000000123, message: { mid: "mid.DEL", is_deleted: true } },
      { sender: { id: "6000000000000001" }, recipient: { id: "17841400000000001" }, timestamp: 1790000000123, reaction: { mid: "mid.X", action: "react", emoji: "❤" } },
      { sender: { id: "6000000000000001" }, recipient: { id: "17841400000000001" }, message: { mid: "mid.SEM_DATA", text: "x" } },
      { recipient: { id: "17841400000000001" }, timestamp: 1790000000123, message: { mid: "mid.SEM_REMETENTE", text: "x" } },
      { sender: { id: "6000000000000001" }, recipient: { id: "17841400000000001" }, timestamp: 1790000000123, message: { text: "sem mid" } },
      { sender: { id: "6000000000000001" }, recipient: { id: "17841400000000001" }, timestamp: 1790000000123, message: { mid: "mid.OK", text: "ok" } },
    ]);

    expect(parseMetaWebhook(payload).map((e) => e.externalMessageId)).toEqual(["mid.OK"]);
  });
});

describe("parseMetaWebhook · payload inválido", () => {
  it.each([
    ["null", null],
    ["string", "oi"],
    ["objeto sem entry", { object: "instagram" }],
    ["entry que não é lista", { object: "instagram", entry: {} }],
    ["objeto de outro produto", { object: "page", entry: [{ id: "1", messaging: [] }] }],
  ])("devolve lista vazia para %s", (_label, payload) => {
    expect(parseMetaWebhook(payload)).toEqual([]);
  });
});

describe("parseMetaWebhook · respostas de menu", () => {
  function whatsappMessage(content: Record<string, unknown>) {
    return whatsappPayload({
      metadata: WA_METADATA,
      contacts: [WA_CONTACT],
      messages: [{ from: "5511988887777", id: "wamid.AAA", timestamp: "1790000000", ...content }],
    });
  }

  it("converte o toque num botão do WhatsApp em texto com o id da opção", () => {
    const payload = whatsappMessage({
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "opt_0", title: "Agendar" } },
    });

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({ kind: "message", type: "text", text: "Agendar", optionId: "opt_0" }),
    ]);
  });

  it("converte a escolha numa lista do WhatsApp em texto com o id da linha", () => {
    const payload = whatsappMessage({
      type: "interactive",
      interactive: { type: "list_reply", list_reply: { id: "slot_1", title: "sáb 03/10 14:30", description: "com Bia" } },
    });

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({ type: "text", text: "sáb 03/10 14:30", optionId: "slot_1" }),
    ]);
  });

  it("converte o botão de resposta rápida de template em texto com o payload", () => {
    const payload = whatsappMessage({ type: "button", button: { text: "Confirmar", payload: "CONFIRMAR" } });

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({ type: "text", text: "Confirmar", optionId: "CONFIRMAR" }),
    ]);
  });

  it("resposta interativa sem id nem título vira mensagem de outro tipo", () => {
    const payload = whatsappMessage({ type: "interactive", interactive: { type: "nfm_reply", nfm_reply: {} } });

    const [event] = parseMetaWebhook(payload);
    expect(event).toMatchObject({ type: "other", text: null });
    expect(event).not.toHaveProperty("optionId");
  });

  it("mensagem comum não tem optionId", () => {
    const [event] = parseMetaWebhook(whatsappMessage({ type: "text", text: { body: "Oi" } }));
    expect(event).not.toHaveProperty("optionId");
  });

  it("converte a resposta rápida do Instagram guardando o payload", () => {
    const payload = instagramPayload([
      {
        sender: { id: "6000000000000001" },
        recipient: { id: "17841400000000001" },
        timestamp: 1790000000123,
        message: { mid: "mid.1", text: "Agendar", quick_reply: { payload: "opt_0" } },
      },
    ]);

    expect(parseMetaWebhook(payload)).toEqual([
      expect.objectContaining({ platform: "instagram", type: "text", text: "Agendar", optionId: "opt_0" }),
    ]);
  });
});
