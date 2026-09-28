import { describe, it, expect, vi } from "vitest";
import {
  addMemory,
  MAX_MEMORIES,
  MAX_MEMORY_LENGTH,
  MAX_THREAD_MESSAGES,
  removeMemory,
  saveThread,
  threadTitle,
  type ThreadRecord,
} from "@/lib/agenia-history";

const WORKSPACE = "64b7f0c2a1b2c3d4e5f60718";
const USER = "64b7f0c2a1b2c3d4e5f60719";
const OTHER_USER = "64b7f0c2a1b2c3d4e5f6071a";
const URA = "64b7f0c2a1b2c3d4e5f6071b";
const KEY = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const ctx = { workspaceId: WORKSPACE, userId: USER };
const NOW = new Date("2026-09-28T12:00:00Z");

const user = (text: string, id = text) => ({ id, role: "user", parts: [{ type: "text", text }] });
const assistant = (text: string, id = `a-${text}`) => ({ id, role: "assistant", parts: [{ type: "text", text }] });

function deps(existing: ThreadRecord | null = null) {
  return { find: vi.fn(async () => existing), upsert: vi.fn(async () => {}), now: () => NOW };
}

describe("threadTitle", () => {
  it("usa a primeira mensagem do usuário numa linha só", () => {
    expect(threadTitle([assistant("oi"), user("Como está\n\no caixa?"), user("outra")])).toBe("Como está o caixa?");
  });

  it("corta títulos longos em 60 caracteres", () => {
    const title = threadTitle([user("a".repeat(100))]);
    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("sem mensagem do usuário, fica Nova conversa", () => {
    expect(threadTitle([])).toBe("Nova conversa");
    expect(threadTitle([assistant("oi")])).toBe("Nova conversa");
  });
});

describe("saveThread", () => {
  it("grava a conversa nova com título, escopo e horário", async () => {
    const d = deps();
    const messages = [user("Quais agendamentos hoje?"), assistant("Três.")];
    expect(await saveThread({ key: KEY, mode: "global", scopeId: null, messages }, ctx, d)).toEqual({ ok: true });
    expect(d.find).toHaveBeenCalledWith(KEY);
    expect(d.upsert).toHaveBeenCalledWith(KEY, {
      workspaceId: WORKSPACE,
      userId: USER,
      mode: "global",
      scopeId: null,
      title: "Quais agendamentos hoje?",
      messages,
      lastMessageAt: NOW,
    });
  });

  it("URA e conversa exigem o id do escopo; a global não aceita", async () => {
    const messages = [user("oi")];
    expect(await saveThread({ key: KEY, mode: "ura", scopeId: URA, messages }, ctx, deps())).toEqual({ ok: true });
    expect(await saveThread({ key: KEY, mode: "ura", scopeId: null, messages }, ctx, deps())).toEqual({ ok: false, error: "invalid_scope" });
    expect(await saveThread({ key: KEY, mode: "conversation", scopeId: "abc", messages }, ctx, deps())).toEqual({
      ok: false,
      error: "invalid_scope",
    });
    expect(await saveThread({ key: KEY, mode: "global", scopeId: URA, messages }, ctx, deps())).toEqual({ ok: false, error: "invalid_scope" });
    expect(await saveThread({ key: KEY, mode: "outro", scopeId: null, messages }, ctx, deps())).toEqual({ ok: false, error: "invalid_scope" });
  });

  it("recusa chave que não é um uuid", async () => {
    const d = deps();
    expect(await saveThread({ key: "../x", mode: "global", scopeId: null, messages: [user("oi")] }, ctx, d)).toEqual({
      ok: false,
      error: "invalid_key",
    });
    expect(d.upsert).not.toHaveBeenCalled();
  });

  it("não deixa gravar na conversa de outro usuário ou de outro workspace", async () => {
    const other = { workspaceId: WORKSPACE, userId: OTHER_USER, mode: "global", scopeId: null } as const;
    const d = deps(other);
    expect(await saveThread({ key: KEY, mode: "global", scopeId: null, messages: [user("oi")] }, ctx, d)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(d.upsert).not.toHaveBeenCalled();

    const otherWorkspace = { workspaceId: URA, userId: USER, mode: "global", scopeId: null } as const;
    expect(
      await saveThread({ key: KEY, mode: "global", scopeId: null, messages: [user("oi")] }, ctx, deps(otherWorkspace)),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("não deixa trocar o escopo de uma conversa existente", async () => {
    const existing = { workspaceId: WORKSPACE, userId: USER, mode: "global", scopeId: null } as const;
    expect(await saveThread({ key: KEY, mode: "ura", scopeId: URA, messages: [user("oi")] }, ctx, deps(existing))).toEqual({
      ok: false,
      error: "invalid_scope",
    });
  });

  it("atualiza a conversa do próprio usuário", async () => {
    const existing = { workspaceId: WORKSPACE, userId: USER, mode: "ura", scopeId: URA } as const;
    const d = deps(existing);
    expect(await saveThread({ key: KEY, mode: "ura", scopeId: URA, messages: [user("oi")] }, ctx, d)).toEqual({ ok: true });
    expect(d.upsert).toHaveBeenCalledOnce();
  });

  it("guarda só as mensagens mais recentes, mas o título vem da primeira pergunta", async () => {
    const d = deps();
    const messages = [user("primeira pergunta", "u0"), ...Array.from({ length: MAX_THREAD_MESSAGES + 10 }, (_, i) => assistant(`r${i}`))];
    await saveThread({ key: KEY, mode: "global", scopeId: null, messages }, ctx, d);
    const saved = (d.upsert.mock.calls[0] as unknown[])[1] as { title: string; messages: unknown[] };
    expect(saved.messages).toHaveLength(MAX_THREAD_MESSAGES);
    expect(saved.messages.at(-1)).toEqual(messages.at(-1));
    expect(saved.title).toBe("primeira pergunta");
  });

  it("sem pergunta do usuário não grava nada", async () => {
    const d = deps();
    expect(await saveThread({ key: KEY, mode: "global", scopeId: null, messages: [] }, ctx, d)).toEqual({ ok: true });
    expect(d.upsert).not.toHaveBeenCalled();
  });

  it("recusa mensagens que não são uma lista", async () => {
    expect(await saveThread({ key: KEY, mode: "global", scopeId: null, messages: "x" as never }, ctx, deps())).toEqual({
      ok: false,
      error: "invalid_messages",
    });
  });
});

describe("addMemory", () => {
  const memoryDeps = (existing: { id: string; content: string }[] = []) => ({
    list: vi.fn(async () => existing),
    insert: vi.fn(async (content: string) => ({ id: `m-${content.length}` })),
  });

  it("guarda o fato sem espaços nas pontas", async () => {
    const d = memoryDeps();
    expect(await addMemory("  O spa não abre aos domingos.  ", ctx, d)).toEqual({ ok: true, id: "m-28" });
    expect(d.insert).toHaveBeenCalledWith("O spa não abre aos domingos.");
  });

  it("não duplica um fato igual (sem diferenciar acentos, maiúsculas e espaços)", async () => {
    const d = memoryDeps([{ id: "m1", content: "O spa não abre aos domingos." }]);
    expect(await addMemory("o spa nao abre  aos domingos.", ctx, d)).toEqual({ ok: true, id: "m1", duplicate: true });
    expect(d.insert).not.toHaveBeenCalled();
  });

  it("recusa vazio, longo demais e não texto", async () => {
    expect(await addMemory("   ", ctx, memoryDeps())).toEqual({ ok: false, error: "invalid_content" });
    expect(await addMemory(42, ctx, memoryDeps())).toEqual({ ok: false, error: "invalid_content" });
    expect(await addMemory("a".repeat(MAX_MEMORY_LENGTH + 1), ctx, memoryDeps())).toEqual({ ok: false, error: "content_too_long" });
  });

  it("recusa quando a memória está cheia", async () => {
    const full = Array.from({ length: MAX_MEMORIES }, (_, i) => ({ id: `m${i}`, content: `fato ${i}` }));
    const d = memoryDeps(full);
    expect(await addMemory("fato novo", ctx, d)).toEqual({ ok: false, error: "memory_full" });
    expect(d.insert).not.toHaveBeenCalled();
  });
});

describe("removeMemory", () => {
  it("remove pelo id", async () => {
    const remove = vi.fn(async () => true);
    expect(await removeMemory("64b7f0c2a1b2c3d4e5f6071c", remove)).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith("64b7f0c2a1b2c3d4e5f6071c");
  });

  it("id inválido ou inexistente vira não encontrado", async () => {
    const remove = vi.fn(async () => false);
    expect(await removeMemory("x", remove)).toEqual({ ok: false, error: "not_found" });
    expect(remove).not.toHaveBeenCalled();
    expect(await removeMemory("64b7f0c2a1b2c3d4e5f6071c", remove)).toEqual({ ok: false, error: "not_found" });
  });
});
