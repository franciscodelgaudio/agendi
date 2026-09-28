// Sem dependências de servidor.
// Transcrição da conversa que vai no contexto da AgenIA: uma linha por mensagem.
import { messageTypeLabels } from "@/lib/messaging-inbox";
import type { MessageDirection, MessageType } from "@/lib/messaging-types";
import { toBrt } from "@/lib/ura-variables";

export type TranscriptMessage = {
  direction: MessageDirection;
  type: MessageType;
  text: string | null;
  sentAt: Date;
  userName: string | null;
  uraName: string | null;
  mediaUrl: string | null;
  options: { title: string }[] | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

function stamp(date: Date) {
  const brt = toBrt(date);
  return `${pad(brt.getUTCDate())}/${pad(brt.getUTCMonth() + 1)} ${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}`;
}

function speaker(message: TranscriptMessage) {
  if (message.direction === "inbound") return "Cliente";
  if (message.uraName) return `URA (${message.uraName})`;
  return message.userName ? `Atendente (${message.userName})` : "Atendente";
}

function body(message: TranscriptMessage) {
  const text = (message.text ?? "").replace(/\s+/g, " ").trim();
  const parts = [message.type === "text" ? "" : `[${messageTypeLabels[message.type]}]`, text].filter(Boolean);
  const options = message.options?.length
    ? ` (opções: ${message.options.map((option, i) => `${i + 1}. ${option.title}`).join("; ")})`
    : "";
  return parts.join(" ") + options;
}

export function formatTranscript(messages: TranscriptMessage[]) {
  return messages.map((message) => `[${stamp(message.sentAt)}] ${speaker(message)}: ${body(message)}`).join("\n");
}
