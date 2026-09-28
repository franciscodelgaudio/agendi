import { describe, it, expect } from "vitest";
import { formatTranscript, type TranscriptMessage } from "@/lib/agenia-conversation";

// 14:30 em Brasília (UTC-3).
const at = (minute: number) => new Date(Date.UTC(2026, 8, 24, 17, minute));

function message(partial: Partial<TranscriptMessage>): TranscriptMessage {
  return {
    direction: "inbound",
    type: "text",
    text: null,
    sentAt: at(30),
    userName: null,
    uraName: null,
    mediaUrl: null,
    options: null,
    ...partial,
  };
}

describe("formatTranscript", () => {
  it("uma linha por mensagem, com data e hora de Brasília e quem falou", () => {
    const transcript = formatTranscript([
      message({ text: "Oi, quero agendar" }),
      message({ direction: "outbound", text: "Claro! Qual dia?", userName: "Bia", sentAt: at(31) }),
      message({ direction: "outbound", text: "Escolha uma opção", uraName: "Boas-vindas", sentAt: at(32) }),
      message({ direction: "outbound", text: "Enviado pelo celular", sentAt: at(33) }),
    ]);
    expect(transcript).toBe(
      [
        "[24/09 14:30] Cliente: Oi, quero agendar",
        "[24/09 14:31] Atendente (Bia): Claro! Qual dia?",
        "[24/09 14:32] URA (Boas-vindas): Escolha uma opção",
        "[24/09 14:33] Atendente: Enviado pelo celular",
      ].join("\n"),
    );
  });

  it("mídia aparece pelo rótulo, com a legenda quando houver", () => {
    expect(formatTranscript([message({ type: "image", text: "Minha foto" })])).toBe("[24/09 14:30] Cliente: [Imagem] Minha foto");
    expect(formatTranscript([message({ type: "audio" })])).toBe("[24/09 14:30] Cliente: [Áudio]");
  });

  it("lista as opções dos menus enviados", () => {
    const transcript = formatTranscript([
      message({
        direction: "outbound",
        uraName: "Menu",
        text: "Como posso ajudar?",
        options: [{ title: "Agendar" }, { title: "Preços" }],
      }),
    ]);
    expect(transcript).toBe("[24/09 14:30] URA (Menu): Como posso ajudar? (opções: 1. Agendar; 2. Preços)");
  });

  it("quebras de linha do texto viram espaço para manter uma linha por mensagem", () => {
    expect(formatTranscript([message({ text: "linha 1\n\nlinha 2" })])).toBe("[24/09 14:30] Cliente: linha 1 linha 2");
  });

  it("conversa vazia vira texto vazio", () => {
    expect(formatTranscript([])).toBe("");
  });
});
