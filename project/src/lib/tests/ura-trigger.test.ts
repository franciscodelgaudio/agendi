import { describe, it, expect } from "vitest";
import { decideInbound, pickUraToStart } from "@/service/workspace/[workspaceId]/uras/ura-trigger";

const CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60718";
const OTHER_CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60799";

type Start = { trigger: "new_conversation" | "keyword" | "any_message"; keywords: string[]; channelIds: string[] };

function ura(id: string, start: Partial<Start>, active = true) {
  return { id, active, start: { trigger: "new_conversation" as const, keywords: [], channelIds: [], ...start } };
}

describe("pickUraToStart", () => {
  const ctx = { channelId: CHANNEL_ID, text: "Oi, quero agendar uma massagem", isNewConversation: true };

  it("prefere palavra-chave, depois conversa nova, depois qualquer mensagem", () => {
    const uras = [
      ura("qualquer", { trigger: "any_message" }),
      ura("nova", { trigger: "new_conversation" }),
      ura("chave", { trigger: "keyword", keywords: ["AGENDAR"] }),
    ];

    expect(pickUraToStart(uras, ctx)).toBe("chave");
    expect(pickUraToStart(uras, { ...ctx, text: "Oi" })).toBe("nova");
    expect(pickUraToStart(uras, { ...ctx, text: "Oi", isNewConversation: false })).toBe("qualquer");
  });

  it("compara palavra-chave sem acentos nem maiúsculas, como palavra inteira", () => {
    const uras = [ura("promo", { trigger: "keyword", keywords: ["promoção"] })];

    expect(pickUraToStart(uras, { ...ctx, text: "Tem PROMOCAO hoje?" })).toBe("promo");
    expect(pickUraToStart(uras, { ...ctx, text: "promoçãozinha", isNewConversation: false })).toBeNull();
  });

  it("aceita palavra-chave com mais de uma palavra", () => {
    const uras = [ura("preco", { trigger: "keyword", keywords: ["tabela de preços"] })];
    expect(pickUraToStart(uras, { ...ctx, text: "me manda a tabela de precos" })).toBe("preco");
  });

  it("ignora URAs inativas e de outros canais; sem canais escolhidos vale para todos", () => {
    const uras = [
      ura("inativa", { trigger: "any_message" }, false),
      ura("outro-canal", { trigger: "any_message", channelIds: [OTHER_CHANNEL_ID] }),
      ura("deste-canal", { trigger: "any_message", channelIds: [OTHER_CHANNEL_ID, CHANNEL_ID] }),
    ];
    expect(pickUraToStart(uras, ctx)).toBe("deste-canal");
    expect(pickUraToStart([ura("todos", { trigger: "any_message" })], ctx)).toBe("todos");
  });

  it("no empate fica com a primeira da lista", () => {
    const uras = [ura("a", { trigger: "new_conversation" }), ura("b", { trigger: "new_conversation" })];
    expect(pickUraToStart(uras, ctx)).toBe("a");
  });

  it("devolve null quando nenhuma URA se aplica", () => {
    expect(pickUraToStart([ura("nova", { trigger: "new_conversation" })], { ...ctx, isNewConversation: false })).toBeNull();
    expect(pickUraToStart([], ctx)).toBeNull();
  });
});

describe("decideInbound", () => {
  const uras = [ura("nova", { trigger: "new_conversation" })];
  const base = {
    uras,
    channelId: CHANNEL_ID,
    text: "Oi",
    isNewConversation: true,
    assignedUserId: null,
    session: null,
  };

  it("retoma a sessão que está esperando resposta", () => {
    expect(decideInbound({ ...base, session: { id: "sessao-1", status: "waiting" } })).toEqual({
      action: "resume",
      sessionId: "sessao-1",
    });
  });

  it("não inicia outra URA enquanto uma sessão está em pausa ou rodando", () => {
    expect(decideInbound({ ...base, session: { id: "sessao-1", status: "sleeping" } })).toEqual({ action: "none" });
    expect(decideInbound({ ...base, session: { id: "sessao-1", status: "running" } })).toEqual({ action: "none" });
  });

  it("inicia a URA do gatilho quando não há sessão", () => {
    expect(decideInbound(base)).toEqual({ action: "start", uraId: "nova" });
  });

  it("não inicia URA em conversa atribuída a uma pessoa, a não ser que ela tenha sido reaberta", () => {
    expect(decideInbound({ ...base, assignedUserId: "user-1", isNewConversation: false })).toEqual({ action: "none" });
    expect(decideInbound({ ...base, assignedUserId: "user-1", isNewConversation: true })).toEqual({
      action: "start",
      uraId: "nova",
    });
  });

  it("não faz nada quando nenhuma URA se aplica", () => {
    expect(decideInbound({ ...base, isNewConversation: false })).toEqual({ action: "none" });
  });
});
