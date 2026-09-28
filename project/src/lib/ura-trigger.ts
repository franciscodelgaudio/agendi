import { normalizeText, type StartData } from "@/lib/ura-nodes";

export type TriggerUra = { id: string; active: boolean; start: StartData };

type InboundContext = { channelId: string; text: string; isNewConversation: boolean };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Palavra-chave como palavra (ou expressão) inteira, sem acentos nem maiúsculas.
function hasKeyword(text: string, keywords: readonly string[]) {
  const normalized = normalizeText(text);
  return keywords.some((keyword) => {
    const key = normalizeText(keyword);
    return !!key && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(key)}($|[^\\p{L}\\p{N}])`, "u").test(normalized);
  });
}

// URA a iniciar para uma mensagem recebida. Prioridade: palavra-chave, conversa nova,
// qualquer mensagem; no empate, a primeira da lista.
export function pickUraToStart(uras: readonly TriggerUra[], { channelId, text, isNewConversation }: InboundContext) {
  const candidates = uras.filter(
    (ura) => ura.active && (!ura.start.channelIds.length || ura.start.channelIds.includes(channelId)),
  );
  const byKeyword = candidates.find((ura) => ura.start.trigger === "keyword" && hasKeyword(text, ura.start.keywords));
  if (byKeyword) return byKeyword.id;
  if (isNewConversation) {
    const byNew = candidates.find((ura) => ura.start.trigger === "new_conversation");
    if (byNew) return byNew.id;
  }
  return candidates.find((ura) => ura.start.trigger === "any_message")?.id ?? null;
}

export type SessionStatus = "running" | "waiting" | "sleeping";

export type InboundDecision = { action: "resume"; sessionId: string } | { action: "start"; uraId: string } | { action: "none" };

// O que fazer com uma mensagem recebida: retomar a sessão que espera resposta, iniciar
// uma URA ou nada. Conversa com atendente só volta para a URA quando é reaberta.
export function decideInbound({
  uras,
  session,
  assignedUserId,
  ...ctx
}: InboundContext & {
  uras: readonly TriggerUra[];
  session: { id: string; status: SessionStatus } | null;
  assignedUserId: string | null;
}): InboundDecision {
  if (session) return session.status === "waiting" ? { action: "resume", sessionId: session.id } : { action: "none" };
  if (assignedUserId && !ctx.isNewConversation) return { action: "none" };
  const uraId = pickUraToStart(uras, ctx);
  return uraId ? { action: "start", uraId } : { action: "none" };
}
