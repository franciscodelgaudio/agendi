import { describe, it, expect, vi } from "vitest";
import { parseUraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph";
import { handleInbound, handleTimer, StaleSessionError } from "@/service/workspace/[workspaceId]/uras/ura-runner";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60790";
const CONVERSATION_ID = "64b7f0c2a1b2c3d4e5f60791";
const URA_ID = "64b7f0c2a1b2c3d4e5f60792";
const SESSION_ID = "64b7f0c2a1b2c3d4e5f60793";
const USER_ID = "64b7f0c2a1b2c3d4e5f60794";
// 09:30 em Brasília.
const NOW = new Date("2026-09-28T12:30:00.000Z");
const MINUTE = 60 * 1000;

function graph(nodes: { id: string; type: string; data?: Record<string, unknown> }[], edges: [string, string, string?][]) {
  const result = parseUraGraph({
    nodes: [{ id: "s", type: "start" }, ...nodes].map((n) => ({ position: { x: 0, y: 0 }, data: {}, ...n })),
    edges: edges.map(([source, target, handle = "default"], i) => ({ id: `e${i}`, source, target, sourceHandle: handle })),
  });
  if (!result.ok) throw new Error(result.error);
  return result.graph;
}

// Início → "Olá, {{contato_primeiro_nome}}!" → pergunta o nome (prazo de 15 min) → handoff.
const askName = graph(
  [
    { id: "oi", type: "sendMessage", data: { text: "Olá, {{contato_primeiro_nome}}!" } },
    { id: "nome", type: "waitForReply", data: { message: "Qual seu nome completo?", variable: "nome", timeoutMinutes: 15 } },
    { id: "fim", type: "handoff", data: { userId: USER_ID, message: "Obrigada, {{nome}}!" } },
  ],
  [
    ["s", "oi"],
    ["oi", "nome"],
    ["nome", "fim"],
  ],
);

const conversation = {
  id: CONVERSATION_ID,
  workspaceId: WORKSPACE_ID,
  channelId: CHANNEL_ID,
  contactName: "Maria Clara",
  contactPhone: "5511988887777",
  assignedUserId: null,
};

const trigger = { id: URA_ID, active: true, start: { trigger: "new_conversation" as const, keywords: [], channelIds: [] } };

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    uraId: URA_ID,
    conversationId: CONVERSATION_ID,
    status: "waiting" as const,
    currentNodeId: "nome",
    variables: {},
    version: 3,
    ...overrides,
  };
}

function makeDeps(g = askName) {
  return {
    now: () => NOW,
    loadConversation: vi.fn().mockResolvedValue(conversation),
    findActiveSession: vi.fn().mockResolvedValue(null),
    loadSession: vi.fn().mockResolvedValue(session()),
    listUras: vi.fn().mockResolvedValue([trigger]),
    loadGraph: vi.fn().mockResolvedValue({ active: true, graph: g }),
    createSession: vi.fn().mockResolvedValue(session({ status: "running", currentNodeId: null, version: 0, variables: { ultima_resposta: "Oi" } })),
    saveSession: vi.fn().mockResolvedValue(true),
    send: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    closeConversation: vi.fn().mockResolvedValue(undefined),
    assignConversation: vi.fn().mockResolvedValue(undefined),
    walkDeps: vi.fn().mockReturnValue({ listServices: vi.fn(), findSlots: vi.fn(), createBooking: vi.fn() }),
  };
}

const inbound = { conversationId: CONVERSATION_ID, text: "Oi", optionId: null, isNewConversation: true };

describe("handleInbound · início", () => {
  it("cria a sessão, roda do início, salva, envia as mensagens e agenda o fim do prazo", async () => {
    const deps = makeDeps();

    await handleInbound(inbound, deps);

    expect(deps.listUras).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(deps.createSession).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      uraId: URA_ID,
      conversationId: CONVERSATION_ID,
      variables: { ultima_resposta: "Oi" },
    });
    expect(deps.walkDeps).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 0, {
      status: "waiting",
      currentNodeId: "nome",
      variables: { ultima_resposta: "Oi" },
      timeoutAt: new Date(NOW.getTime() + 15 * MINUTE),
      wakeAt: null,
      endReason: null,
      trace: ["s", "oi", "nome"],
    });
    expect(deps.send.mock.calls).toEqual([
      [conversation, { kind: "text", text: "Olá, Maria!" }, URA_ID],
      [conversation, { kind: "text", text: "Qual seu nome completo?" }, URA_ID],
    ]);
    expect(deps.schedule).toHaveBeenCalledWith({ kind: "timeout", sessionId: SESSION_ID, version: 1 }, new Date(NOW.getTime() + 15 * MINUTE));
    // Salva antes de enviar: se outra rodada ganhou a corrida, nada sai em dobro.
    expect(deps.saveSession.mock.invocationCallOrder[0]).toBeLessThan(deps.send.mock.invocationCallOrder[0]);
  });

  it("não faz nada quando outra mensagem já criou a sessão", async () => {
    const deps = makeDeps();
    deps.createSession.mockResolvedValue(null);

    await handleInbound(inbound, deps);

    expect(deps.saveSession).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("não faz nada quando nenhuma URA se aplica", async () => {
    const deps = makeDeps();

    await handleInbound({ ...inbound, isNewConversation: false }, deps);

    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("não faz nada quando a conversa não existe mais", async () => {
    const deps = makeDeps();
    deps.loadConversation.mockResolvedValue(null);

    await handleInbound(inbound, deps);

    expect(deps.findActiveSession).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe("handleInbound · sessão esperando", () => {
  it("retoma o nó de espera com a resposta e aplica o handoff no fim", async () => {
    const deps = makeDeps();
    deps.findActiveSession.mockResolvedValue(session());

    await handleInbound({ ...inbound, text: "Maria Clara Souza", isNewConversation: false }, deps);

    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 3, {
      status: "ended",
      currentNodeId: null,
      variables: { nome: "Maria Clara Souza", ultima_resposta: "Maria Clara Souza" },
      timeoutAt: null,
      wakeAt: null,
      endReason: "handoff",
      trace: ["nome", "fim"],
    });
    expect(deps.send).toHaveBeenCalledWith(conversation, { kind: "text", text: "Obrigada, Maria Clara Souza!" }, URA_ID);
    expect(deps.assignConversation).toHaveBeenCalledWith(CONVERSATION_ID, USER_ID);
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("lança StaleSessionError e não envia nada quando outra rodada salvou antes", async () => {
    const deps = makeDeps();
    deps.findActiveSession.mockResolvedValue(session());
    deps.saveSession.mockResolvedValue(false);

    await expect(handleInbound({ ...inbound, isNewConversation: false }, deps)).rejects.toBeInstanceOf(StaleSessionError);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.assignConversation).not.toHaveBeenCalled();
  });

  it("encerra a sessão como cancelada quando a URA foi desativada ou apagada", async () => {
    for (const graphResult of [{ active: false, graph: askName }, null]) {
      const deps = makeDeps();
      deps.findActiveSession.mockResolvedValue(session());
      deps.loadGraph.mockResolvedValue(graphResult);

      await handleInbound({ ...inbound, isNewConversation: false }, deps);

      expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 3, {
        status: "ended",
        currentNodeId: null,
        variables: {},
        timeoutAt: null,
        wakeAt: null,
        endReason: "cancelled",
        trace: [],
      });
      expect(deps.send).not.toHaveBeenCalled();
    }
  });

  it("ignora a mensagem enquanto a sessão está em pausa", async () => {
    const deps = makeDeps();
    deps.findActiveSession.mockResolvedValue(session({ status: "sleeping" }));

    await handleInbound({ ...inbound, isNewConversation: false }, deps);

    expect(deps.saveSession).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
  });
});

describe("handleInbound · fins de fluxo", () => {
  it("encerrar conversa fecha a conversa", async () => {
    const deps = makeDeps(graph([{ id: "c", type: "closeConversation", data: { message: "Tchau" } }], [["s", "c"]]));

    await handleInbound(inbound, deps);

    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 0, expect.objectContaining({ status: "ended", endReason: "closed" }));
    expect(deps.closeConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(deps.assignConversation).not.toHaveBeenCalled();
  });

  it("pausa agenda o despertar com a nova versão", async () => {
    const deps = makeDeps(
      graph(
        [
          { id: "d", type: "delay", data: { seconds: 30 } },
          { id: "b", type: "sendMessage", data: { text: "Voltei" } },
        ],
        [
          ["s", "d"],
          ["d", "b"],
        ],
      ),
    );

    await handleInbound(inbound, deps);

    const wakeAt = new Date(NOW.getTime() + 30 * 1000);
    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 0, expect.objectContaining({ status: "sleeping", currentNodeId: "b", wakeAt }));
    expect(deps.schedule).toHaveBeenCalledWith({ kind: "wake", sessionId: SESSION_ID, version: 1 }, wakeAt);
  });

  it("espera sem prazo não agenda nada", async () => {
    const deps = makeDeps(graph([{ id: "w", type: "waitForReply" }], [["s", "w"]]));
    await handleInbound(inbound, deps);
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("fim normal só encerra a sessão", async () => {
    const deps = makeDeps(graph([{ id: "a", type: "sendMessage", data: { text: "Oi" } }], [["s", "a"]]));
    await handleInbound(inbound, deps);
    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 0, expect.objectContaining({ status: "ended", endReason: "completed" }));
    expect(deps.closeConversation).not.toHaveBeenCalled();
    expect(deps.assignConversation).not.toHaveBeenCalled();
  });
});

describe("handleTimer", () => {
  it("no fim do prazo retoma o nó de espera pela saída timeout", async () => {
    const withTimeout = graph(
      [
        { id: "nome", type: "waitForReply", data: { timeoutMinutes: 15 } },
        { id: "t", type: "sendMessage", data: { text: "Ainda está aí?" } },
      ],
      [
        ["s", "nome"],
        ["nome", "t", "timeout"],
      ],
    );
    const deps = makeDeps(withTimeout);

    await handleTimer({ kind: "timeout", sessionId: SESSION_ID, version: 3 }, deps);

    expect(deps.loadSession).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.send).toHaveBeenCalledWith(conversation, { kind: "text", text: "Ainda está aí?" }, URA_ID);
    expect(deps.saveSession).toHaveBeenCalledWith(SESSION_ID, 3, expect.objectContaining({ status: "ended", trace: ["nome", "t"] }));
  });

  it("ao acordar roda o nó seguinte à pausa", async () => {
    const deps = makeDeps(graph([{ id: "b", type: "sendMessage", data: { text: "Voltei" } }], [["s", "b"]]));
    deps.loadSession.mockResolvedValue(session({ status: "sleeping", currentNodeId: "b" }));

    await handleTimer({ kind: "wake", sessionId: SESSION_ID, version: 3 }, deps);

    expect(deps.send).toHaveBeenCalledWith(conversation, { kind: "text", text: "Voltei" }, URA_ID);
  });

  it("ignora timer de versão antiga, de sessão encerrada ou de outro estado", async () => {
    const cases = [
      { job: { kind: "timeout" as const, sessionId: SESSION_ID, version: 2 }, found: session() },
      { job: { kind: "timeout" as const, sessionId: SESSION_ID, version: 3 }, found: null },
      { job: { kind: "wake" as const, sessionId: SESSION_ID, version: 3 }, found: session({ status: "waiting" }) },
      { job: { kind: "timeout" as const, sessionId: SESSION_ID, version: 3 }, found: session({ status: "sleeping" }) },
    ];
    for (const { job, found } of cases) {
      const deps = makeDeps();
      deps.loadSession.mockResolvedValue(found);

      await handleTimer(job, deps);

      expect(deps.saveSession).not.toHaveBeenCalled();
      expect(deps.send).not.toHaveBeenCalled();
    }
  });
});
