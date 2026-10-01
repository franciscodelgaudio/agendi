// Sem dependências de servidor.
// Histórico das conversas com a AgenIA (por usuário e escopo) e a memória do workspace.
import { normalizeText } from "@/service/workspace/[workspaceId]/uras/ura-nodes";

export const MAX_THREAD_MESSAGES = 200;
export const MAX_TITLE_LENGTH = 60;
export const MAX_MEMORIES = 50;
export const MAX_MEMORY_LENGTH = 300;

export const THREAD_MODES = ["global", "ura", "conversation"] as const;
export type ThreadMode = (typeof THREAD_MODES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

type Part = { type?: unknown; text?: unknown };
type RawMessage = { role?: unknown; parts?: unknown };

export function threadTitle(messages: unknown[]) {
  const first = messages.find((m) => (m as RawMessage)?.role === "user") as RawMessage | undefined;
  const parts = Array.isArray(first?.parts) ? (first.parts as Part[]) : [];
  const text = parts
    .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Nova conversa";
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text;
}

// O que já está gravado de uma thread, para conferir dono e escopo.
export type ThreadRecord = { workspaceId: string; userId: string; mode: ThreadMode; scopeId: string | null };

export type ThreadData = ThreadRecord & { title: string; messages: unknown[]; lastMessageAt: Date };

export type SaveThreadError = "invalid_key" | "invalid_scope" | "invalid_messages" | "forbidden";

function parseScope(mode: unknown, scopeId: unknown): { mode: ThreadMode; scopeId: string | null } | null {
  if (!THREAD_MODES.includes(mode as ThreadMode)) return null;
  if (mode === "global") return scopeId == null ? { mode, scopeId: null } : null;
  return typeof scopeId === "string" && OBJECT_ID.test(scopeId) ? { mode: mode as ThreadMode, scopeId } : null;
}

// Cada thread é de um usuário num workspace e num escopo fixo; só o dono grava nela.
export async function saveThread(
  input: { key: unknown; mode: unknown; scopeId: unknown; messages: unknown },
  ctx: { workspaceId: string; userId: string },
  deps: {
    find: (key: string) => Promise<ThreadRecord | null>;
    upsert: (key: string, data: ThreadData) => Promise<void>;
    now: () => Date;
  },
): Promise<{ ok: true } | { ok: false; error: SaveThreadError }> {
  if (typeof input.key !== "string" || !UUID.test(input.key)) return { ok: false, error: "invalid_key" };
  const scope = parseScope(input.mode, input.scopeId);
  if (!scope) return { ok: false, error: "invalid_scope" };
  if (!Array.isArray(input.messages)) return { ok: false, error: "invalid_messages" };

  const existing = await deps.find(input.key);
  if (existing) {
    if (existing.userId !== ctx.userId || existing.workspaceId !== ctx.workspaceId) return { ok: false, error: "forbidden" };
    if (existing.mode !== scope.mode || existing.scopeId !== scope.scopeId) return { ok: false, error: "invalid_scope" };
  }

  const messages = input.messages as unknown[];
  if (!messages.some((m) => (m as RawMessage)?.role === "user")) return { ok: true };

  await deps.upsert(input.key, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    ...scope,
    title: threadTitle(messages),
    // Sem os campos undefined: o Mongo os gravaria como null e o AI SDK recusaria o histórico.
    messages: JSON.parse(JSON.stringify(messages.slice(-MAX_THREAD_MESSAGES))),
    lastMessageAt: deps.now(),
  });
  return { ok: true };
}

const sameFact = (a: string) => normalizeText(a).replace(/\s+/g, " ");

export type AddMemoryError = "invalid_content" | "content_too_long" | "memory_full";

// Fato que a AgenIA aprendeu; um igual ao que já existe não é gravado de novo.
export async function addMemory(
  content: unknown,
  _ctx: { workspaceId: string; userId: string },
  deps: { list: () => Promise<{ id: string; content: string }[]>; insert: (content: string) => Promise<{ id: string }> },
): Promise<{ ok: true; id: string; duplicate?: true } | { ok: false; error: AddMemoryError }> {
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "invalid_content" };
  const fact = content.trim();
  if (fact.length > MAX_MEMORY_LENGTH) return { ok: false, error: "content_too_long" };

  const memories = await deps.list();
  const same = memories.find((memory) => sameFact(memory.content) === sameFact(fact));
  if (same) return { ok: true, id: same.id, duplicate: true };
  if (memories.length >= MAX_MEMORIES) return { ok: false, error: "memory_full" };

  const { id } = await deps.insert(fact);
  return { ok: true, id };
}

export async function removeMemory(
  memoryId: string,
  remove: (memoryId: string) => Promise<boolean>,
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  if (!OBJECT_ID.test(memoryId)) return { ok: false, error: "not_found" };
  return (await remove(memoryId)) ? { ok: true } : { ok: false, error: "not_found" };
}
