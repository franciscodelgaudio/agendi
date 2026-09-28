import { describe, it, expect, vi } from "vitest";
import { ingestWebhookEvents, messagePreview, statusesBefore } from "@/lib/messaging-inbox";
import type { WebhookEvent } from "@/lib/meta-webhook";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60790";
const CONVERSATION_ID = "64b7f0c2a1b2c3d4e5f60791";
const SENT_AT = new Date("2026-09-24T12:00:00.000Z");

const inbound: WebhookEvent = {
  kind: "message",
  platform: "whatsapp",
  channelExternalId: "106540352242922",
  contactExternalId: "5511988887777",
  contactName: "Maria Souza",
  externalMessageId: "wamid.AAA",
  direction: "inbound",
  type: "text",
  text: "Oi, tem horário amanhã?",
  sentAt: SENT_AT,
};

const delivered: WebhookEvent = {
  kind: "status",
  platform: "whatsapp",
  channelExternalId: "106540352242922",
  externalMessageId: "wamid.OUT",
  status: "delivered",
  at: SENT_AT,
  error: null,
};

function makeDeps() {
  return {
    findChannel: vi.fn().mockResolvedValue({ id: CHANNEL_ID, workspaceId: WORKSPACE_ID }),
    upsertConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
    insertMessage: vi.fn().mockResolvedValue(true),
    touchConversation: vi.fn().mockResolvedValue(undefined),
    updateMessageStatus: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ingestWebhookEvents · mensagens", () => {
  it("salva a mensagem recebida na conversa do contato e atualiza a conversa", async () => {
    const deps = makeDeps();

    const result = await ingestWebhookEvents([inbound], deps);

    expect(result).toEqual({ messages: 1, statuses: 0, skipped: 0 });
    expect(deps.findChannel).toHaveBeenCalledWith("whatsapp", "106540352242922");
    expect(deps.upsertConversation).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      platform: "whatsapp",
      contactExternalId: "5511988887777",
      contactName: "Maria Souza",
    });
    expect(deps.insertMessage).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      direction: "inbound",
      externalMessageId: "wamid.AAA",
      type: "text",
      text: "Oi, tem horário amanhã?",
      status: null,
      sentAt: SENT_AT,
    });
    expect(deps.touchConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
      lastMessageAt: SENT_AT,
      lastMessagePreview: "Oi, tem horário amanhã?",
      inbound: true,
    });
  });

  it("salva a mensagem enviada direto pelo app (eco) como saída já enviada, sem contar como não lida", async () => {
    const deps = makeDeps();

    await ingestWebhookEvents(
      [{ ...inbound, platform: "instagram", direction: "outbound", contactName: null, text: "Temos sim" }],
      deps,
    );

    expect(deps.upsertConversation).toHaveBeenCalledWith(expect.objectContaining({ platform: "instagram", contactName: null }));
    expect(deps.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: "outbound", status: "sent" }));
    expect(deps.touchConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
      lastMessageAt: SENT_AT,
      lastMessagePreview: "Temos sim",
      inbound: false,
    });
  });

  it("usa o rótulo do tipo como prévia de mídia sem legenda", async () => {
    const deps = makeDeps();

    await ingestWebhookEvents([{ ...inbound, type: "audio", text: null }], deps);

    expect(deps.touchConversation).toHaveBeenCalledWith(CONVERSATION_ID, expect.objectContaining({ lastMessagePreview: "Áudio" }));
  });

  it("não atualiza a conversa quando a mensagem já tinha sido salva (reenvio do webhook)", async () => {
    const deps = makeDeps();
    deps.insertMessage.mockResolvedValue(false);

    const result = await ingestWebhookEvents([inbound], deps);

    expect(result).toEqual({ messages: 0, statuses: 0, skipped: 1 });
    expect(deps.touchConversation).not.toHaveBeenCalled();
  });

  it("ignora mensagens de números ou contas que não estão conectados", async () => {
    const deps = makeDeps();
    deps.findChannel.mockResolvedValue(null);

    const result = await ingestWebhookEvents([inbound], deps);

    expect(result).toEqual({ messages: 0, statuses: 0, skipped: 1 });
    expect(deps.upsertConversation).not.toHaveBeenCalled();
    expect(deps.insertMessage).not.toHaveBeenCalled();
  });
});

describe("ingestWebhookEvents · status", () => {
  it("avança o status da mensagem enviada só a partir dos status anteriores", async () => {
    const deps = makeDeps();

    const result = await ingestWebhookEvents([delivered], deps);

    expect(result).toEqual({ messages: 0, statuses: 1, skipped: 0 });
    expect(deps.updateMessageStatus).toHaveBeenCalledWith({
      channelId: CHANNEL_ID,
      externalMessageId: "wamid.OUT",
      status: "delivered",
      error: null,
      from: ["pending", "sent"],
    });
    expect(deps.upsertConversation).not.toHaveBeenCalled();
  });

  it("repassa o erro do status failed", async () => {
    const deps = makeDeps();

    await ingestWebhookEvents([{ ...delivered, status: "failed", error: "Mais de 24 horas" }], deps);

    expect(deps.updateMessageStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "Mais de 24 horas", from: ["pending", "sent"] }),
    );
  });

  it("ignora status de números ou contas que não estão conectados", async () => {
    const deps = makeDeps();
    deps.findChannel.mockResolvedValue(null);

    const result = await ingestWebhookEvents([delivered], deps);

    expect(result).toEqual({ messages: 0, statuses: 0, skipped: 1 });
    expect(deps.updateMessageStatus).not.toHaveBeenCalled();
  });
});

describe("ingestWebhookEvents · lote", () => {
  it("processa os eventos na ordem e conta cada resultado", async () => {
    const deps = makeDeps();
    deps.insertMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await ingestWebhookEvents(
      [inbound, { ...inbound, externalMessageId: "wamid.DUP" }, delivered],
      deps,
    );

    expect(result).toEqual({ messages: 1, statuses: 1, skipped: 1 });
    expect(deps.insertMessage.mock.calls.map(([data]) => data.externalMessageId)).toEqual(["wamid.AAA", "wamid.DUP"]);
  });

  it("não faz nada com lista vazia", async () => {
    const deps = makeDeps();

    expect(await ingestWebhookEvents([], deps)).toEqual({ messages: 0, statuses: 0, skipped: 0 });
    expect(deps.findChannel).not.toHaveBeenCalled();
  });
});

describe("messagePreview", () => {
  it("usa o texto sem espaços nas pontas", () => {
    expect(messagePreview("text", "  Oi  ")).toBe("Oi");
  });

  it("junta quebras de linha e espaços repetidos", () => {
    expect(messagePreview("text", "Oi\n\ntudo   bem?")).toBe("Oi tudo bem?");
  });

  it("corta textos com mais de 100 caracteres com reticências", () => {
    expect(messagePreview("text", "a".repeat(100))).toBe("a".repeat(100));
    expect(messagePreview("text", "a".repeat(101))).toBe(`${"a".repeat(100)}…`);
  });

  it.each([
    ["image", "Imagem"],
    ["video", "Vídeo"],
    ["audio", "Áudio"],
    ["document", "Documento"],
    ["sticker", "Figurinha"],
    ["other", "Mensagem"],
    ["text", "Mensagem"],
  ] as const)("usa o rótulo de %s quando não há texto", (type, label) => {
    expect(messagePreview(type, null)).toBe(label);
    expect(messagePreview(type, "   ")).toBe(label);
  });

  it("prefere a legenda ao rótulo da mídia", () => {
    expect(messagePreview("image", "Olha a foto")).toBe("Olha a foto");
  });
});

describe("statusesBefore", () => {
  it.each([
    ["sent", ["pending"]],
    ["delivered", ["pending", "sent"]],
    ["read", ["pending", "sent", "delivered"]],
    ["failed", ["pending", "sent"]],
  ] as const)("%s só substitui %j", (status, expected) => {
    expect(statusesBefore(status)).toEqual(expected);
  });
});

describe("ingestWebhookEvents · aviso de mensagem recebida", () => {
  it("avisa cada mensagem recebida nova, com a conversa, o texto e a opção escolhida", async () => {
    const deps = { ...makeDeps(), onInbound: vi.fn().mockResolvedValue(undefined) };

    await ingestWebhookEvents([{ ...inbound, text: "Agendar", optionId: "opt_0" }, { ...inbound, externalMessageId: "wamid.BBB" }], deps);

    expect(deps.onInbound.mock.calls).toEqual([
      [{ workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID, conversationId: CONVERSATION_ID, text: "Agendar", optionId: "opt_0" }],
      [
        {
          workspaceId: WORKSPACE_ID,
          channelId: CHANNEL_ID,
          conversationId: CONVERSATION_ID,
          text: "Oi, tem horário amanhã?",
          optionId: null,
        },
      ],
    ]);
    // Só depois de atualizar a conversa.
    expect(deps.touchConversation.mock.invocationCallOrder[0]).toBeLessThan(deps.onInbound.mock.invocationCallOrder[0]);
  });

  it("usa texto vazio para mídia sem legenda", async () => {
    const deps = { ...makeDeps(), onInbound: vi.fn().mockResolvedValue(undefined) };
    await ingestWebhookEvents([{ ...inbound, type: "image", text: null }], deps);
    expect(deps.onInbound).toHaveBeenCalledWith(expect.objectContaining({ text: "" }));
  });

  it("não avisa ecos enviados pelo app nem mensagens repetidas", async () => {
    const deps = { ...makeDeps(), onInbound: vi.fn().mockResolvedValue(undefined) };
    deps.insertMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await ingestWebhookEvents([{ ...inbound, platform: "instagram", direction: "outbound" }, inbound], deps);

    expect(deps.onInbound).not.toHaveBeenCalled();
  });
});
