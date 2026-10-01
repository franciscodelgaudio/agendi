import { describe, it, expect, vi } from "vitest";
import { sendReply } from "@/lib/messaging-send";
import type { Actor } from "@/lib/permissions";
import { ADMIN, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";
const CONVERSATION_ID = "64b7f0c2a1b2c3d4e5f60791";
const MESSAGE_ID = "64b7f0c2a1b2c3d4e5f60792";
const NOW = new Date("2026-09-24T12:00:00.000Z");
const HOURS = 60 * 60 * 1000;

const conversation = {
  id: CONVERSATION_ID,
  platform: "whatsapp" as const,
  contactExternalId: "5511988887777",
  lastInboundAt: new Date(NOW.getTime() - 2 * HOURS),
  channel: { externalId: "106540352242922", accessToken: "EAAGm0PX4ZCpsBA" },
};

function makeCtx(overrides: Partial<Parameters<typeof sendReply>[1]> = {}) {
  return { workspaceId: WORKSPACE_ID, userId: USER_ID, actor: actorWith("inbox.use") as Actor | null, conversation, ...overrides };
}

function makeDeps() {
  return {
    now: () => NOW,
    insertMessage: vi.fn().mockResolvedValue({ id: MESSAGE_ID }),
    touchConversation: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue({ ok: true, externalMessageId: "wamid.OUT" }),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe("sendReply", () => {
  it("salva a mensagem como pendente, envia pela plataforma e marca como enviada", async () => {
    const deps = makeDeps();

    const result = await sendReply({ text: "  Temos às 15h!\nPode ser?  " }, makeCtx(), deps);

    expect(result).toEqual({ ok: true, messageId: MESSAGE_ID });
    expect(deps.insertMessage).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      direction: "outbound",
      externalMessageId: null,
      type: "text",
      text: "Temos às 15h!\nPode ser?",
      status: "pending",
      sentAt: NOW,
      sentByUserId: USER_ID,
    });
    expect(deps.touchConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
      lastMessageAt: NOW,
      lastMessagePreview: "Temos às 15h! Pode ser?",
      inbound: false,
    });
    expect(deps.send).toHaveBeenCalledWith({
      platform: "whatsapp",
      channelExternalId: "106540352242922",
      accessToken: "EAAGm0PX4ZCpsBA",
      to: "5511988887777",
      text: "Temos às 15h!\nPode ser?",
    });
    expect(deps.markSent).toHaveBeenCalledWith(MESSAGE_ID, "wamid.OUT");
    expect(deps.markFailed).not.toHaveBeenCalled();
    // Só envia depois de salvar, para a mensagem nunca sair sem registro.
    expect(deps.insertMessage.mock.invocationCallOrder[0]).toBeLessThan(deps.send.mock.invocationCallOrder[0]);
  });

  it("marca a mensagem como falha e devolve o detalhe quando a plataforma recusa", async () => {
    const deps = makeDeps();
    deps.send.mockResolvedValue({ ok: false, reason: "api_error", detail: "(#131047) Re-engagement message" });

    const result = await sendReply({ text: "Oi" }, makeCtx(), deps);

    expect(result).toEqual({ ok: false, error: "send_failed", detail: "(#131047) Re-engagement message" });
    expect(deps.markFailed).toHaveBeenCalledWith(MESSAGE_ID, "(#131047) Re-engagement message");
    expect(deps.markSent).not.toHaveBeenCalled();
  });

  it("marca como falha sem detalhe quando a requisição não chega à plataforma", async () => {
    const deps = makeDeps();
    deps.send.mockResolvedValue({ ok: false, reason: "network_error", detail: null });

    const result = await sendReply({ text: "Oi" }, makeCtx(), deps);

    expect(result).toEqual({ ok: false, error: "send_failed", detail: null });
    expect(deps.markFailed).toHaveBeenCalledWith(MESSAGE_ID, null);
  });

  it.each([
    ["administrador", ADMIN],
    ["role que usa as Conversas", actorWith("inbox.use")],
  ] as const)("%s pode responder", async (_label, actor) => {
    const result = await sendReply({ text: "Oi" }, makeCtx({ actor }), makeDeps());

    expect(result).toEqual({ ok: true, messageId: MESSAGE_ID });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["role sem a permissão das Conversas", actorWith("bookings.manage", "attends"), "forbidden"],
  ] as const)("recusa sem salvar quando o autor é %s", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await sendReply({ text: "Oi" }, makeCtx({ actor }), deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insertMessage).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("recusa sem salvar quando a conversa não existe no workspace", async () => {
    const deps = makeDeps();

    const result = await sendReply({ text: "Oi" }, makeCtx({ conversation: null }), deps);

    expect(result).toEqual({ ok: false, error: "conversation_not_found" });
    expect(deps.insertMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["texto ausente (null do FormData)", { text: null }, "invalid_input"],
    ["texto vazio", { text: "" }, "empty_text"],
    ["texto só com espaços", { text: " \n " }, "empty_text"],
    ["texto com mais de 4096 caracteres no WhatsApp", { text: "a".repeat(4097) }, "text_too_long"],
  ])("recusa sem salvar com %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await sendReply(input, makeCtx(), deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insertMessage).not.toHaveBeenCalled();
  });

  it("aceita 4096 caracteres no WhatsApp", async () => {
    const result = await sendReply({ text: "a".repeat(4096) }, makeCtx(), makeDeps());

    expect(result).toEqual({ ok: true, messageId: MESSAGE_ID });
  });

  it("limita a 1000 caracteres no Instagram", async () => {
    const instagram = { ...conversation, platform: "instagram" as const };

    expect(await sendReply({ text: "a".repeat(1000) }, makeCtx({ conversation: instagram }), makeDeps())).toEqual({
      ok: true,
      messageId: MESSAGE_ID,
    });
    expect(await sendReply({ text: "a".repeat(1001) }, makeCtx({ conversation: instagram }), makeDeps())).toEqual({
      ok: false,
      error: "text_too_long",
    });
  });

  it("permite responder até exatamente 24h depois da última mensagem do cliente", async () => {
    const lastInboundAt = new Date(NOW.getTime() - 24 * HOURS);

    const result = await sendReply({ text: "Oi" }, makeCtx({ conversation: { ...conversation, lastInboundAt } }), makeDeps());

    expect(result).toEqual({ ok: true, messageId: MESSAGE_ID });
  });

  it.each([
    ["passou das 24h desde a última mensagem do cliente", new Date(NOW.getTime() - 24 * HOURS - 1)],
    ["o cliente nunca mandou mensagem", null],
  ])("recusa sem salvar quando %s", async (_label, lastInboundAt) => {
    const deps = makeDeps();

    const result = await sendReply({ text: "Oi" }, makeCtx({ conversation: { ...conversation, lastInboundAt } }), deps);

    expect(result).toEqual({ ok: false, error: "window_closed" });
    expect(deps.insertMessage).not.toHaveBeenCalled();
  });

  it("recusa sem salvar quando o token do canal não pôde ser lido", async () => {
    const deps = makeDeps();
    const broken = { ...conversation, channel: { ...conversation.channel, accessToken: null } };

    const result = await sendReply({ text: "Oi" }, makeCtx({ conversation: broken }), deps);

    expect(result).toEqual({ ok: false, error: "channel_unavailable" });
    expect(deps.insertMessage).not.toHaveBeenCalled();
  });
});
