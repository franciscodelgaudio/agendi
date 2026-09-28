import type { UraGraph } from "@/lib/ura-graph";
import { decideInbound, type SessionStatus, type TriggerUra } from "@/lib/ura-trigger";
import { builtinVariables, type UraVariables } from "@/lib/ura-variables";
import { walkUra, type Outgoing, type WalkDeps, type WalkInput } from "@/lib/ura-walk";

export type RunnerConversation = {
  id: string;
  workspaceId: string;
  channelId: string;
  contactName: string | null;
  contactPhone: string | null;
  assignedUserId: string | null;
};

export type RunnerSession = {
  id: string;
  uraId: string;
  conversationId: string;
  status: SessionStatus;
  // null enquanto a sessão acabou de ser criada e ainda não rodou.
  currentNodeId: string | null;
  variables: UraVariables;
  version: number;
};

export type SessionEndReason = "completed" | "closed" | "handoff" | "limit" | "cancelled";

export type SessionUpdate = {
  status: "waiting" | "sleeping" | "ended";
  currentNodeId: string | null;
  variables: UraVariables;
  timeoutAt: Date | null;
  wakeAt: Date | null;
  endReason: SessionEndReason | null;
  trace: string[];
};

// Timer de sessão; version é a da sessão quando o timer foi agendado.
export type TimerJob = { kind: "timeout" | "wake"; sessionId: string; version: number };

export type InboundJob = { conversationId: string; text: string; optionId: string | null; isNewConversation: boolean };

export type RunnerDeps = {
  now: () => Date;
  loadConversation: (conversationId: string) => Promise<RunnerConversation | null>;
  findActiveSession: (conversationId: string) => Promise<RunnerSession | null>;
  loadSession: (sessionId: string) => Promise<RunnerSession | null>;
  // URAs do workspace, na ordem de prioridade do empate.
  listUras: (workspaceId: string) => Promise<TriggerUra[]>;
  loadGraph: (uraId: string) => Promise<{ active: boolean; graph: UraGraph } | null>;
  // null quando a conversa já tem sessão ativa (outra mensagem ganhou a corrida).
  createSession: (data: {
    workspaceId: string;
    uraId: string;
    conversationId: string;
    variables: UraVariables;
  }) => Promise<RunnerSession | null>;
  // false quando a versão salva não é mais expectedVersion. Salvar incrementa a versão.
  saveSession: (sessionId: string, expectedVersion: number, update: SessionUpdate) => Promise<boolean>;
  send: (conversation: RunnerConversation, outgoing: Outgoing, uraId: string) => Promise<void>;
  schedule: (job: TimerJob, at: Date) => Promise<void>;
  closeConversation: (conversationId: string) => Promise<void>;
  assignConversation: (conversationId: string, userId: string | null) => Promise<void>;
  walkDeps: (workspaceId: string) => WalkDeps;
};

// Outra rodada da mesma sessão salvou antes; a fila tenta o job de novo.
export class StaleSessionError extends Error {
  constructor() {
    super("URA session changed while running");
  }
}

const ended = (endReason: SessionEndReason, variables: UraVariables, trace: string[] = []): SessionUpdate => ({
  status: "ended",
  currentNodeId: null,
  variables,
  timeoutAt: null,
  wakeAt: null,
  endReason,
  trace,
});

async function save(deps: RunnerDeps, session: RunnerSession, update: SessionUpdate) {
  if (!(await deps.saveSession(session.id, session.version, update))) throw new StaleSessionError();
}

// Roda a sessão a partir da posição, salva o novo estado e só então envia e agenda.
async function advance(
  deps: RunnerDeps,
  conversation: RunnerConversation,
  session: RunnerSession,
  position: WalkInput["position"],
  reply: WalkInput["reply"],
) {
  const ura = await deps.loadGraph(session.uraId);
  if (!ura?.active) {
    await save(deps, session, ended("cancelled", session.variables));
    return;
  }

  const now = deps.now();
  const result = await walkUra(
    {
      graph: ura.graph,
      position,
      reply,
      variables: session.variables,
      builtins: builtinVariables(now, { name: conversation.contactName, phone: conversation.contactPhone }),
      now,
    },
    deps.walkDeps(conversation.workspaceId),
  );

  const { state, variables, trace } = result;
  const update: SessionUpdate =
    state.status === "ended"
      ? ended(state.reason, variables, trace)
      : {
          status: state.status,
          currentNodeId: state.nodeId,
          variables,
          timeoutAt: state.status === "waiting" ? state.timeoutAt : null,
          wakeAt: state.status === "sleeping" ? state.wakeAt : null,
          endReason: null,
          trace,
        };
  await save(deps, session, update);

  for (const outgoing of result.outgoing) await deps.send(conversation, outgoing, session.uraId);

  const version = session.version + 1;
  if (state.status === "waiting" && state.timeoutAt) {
    await deps.schedule({ kind: "timeout", sessionId: session.id, version }, state.timeoutAt);
  } else if (state.status === "sleeping") {
    await deps.schedule({ kind: "wake", sessionId: session.id, version }, state.wakeAt);
  } else if (state.status === "ended" && state.reason === "closed") {
    await deps.closeConversation(conversation.id);
  } else if (state.status === "ended" && state.reason === "handoff") {
    await deps.assignConversation(conversation.id, state.assignUserId);
  }
}

// Mensagem recebida: retoma a sessão que espera resposta ou inicia a URA do gatilho.
export async function handleInbound(job: InboundJob, deps: RunnerDeps) {
  const conversation = await deps.loadConversation(job.conversationId);
  if (!conversation) return;

  const session = await deps.findActiveSession(conversation.id);
  const decision = decideInbound({
    uras: await deps.listUras(conversation.workspaceId),
    session,
    assignedUserId: conversation.assignedUserId,
    channelId: conversation.channelId,
    text: job.text,
    isNewConversation: job.isNewConversation,
  });
  const reply = { text: job.text, optionId: job.optionId };

  if (decision.action === "resume" && session?.currentNodeId) {
    await advance(deps, conversation, session, { nodeId: session.currentNodeId, resume: "reply" }, reply);
    return;
  }
  if (decision.action !== "start") return;

  const created = await deps.createSession({
    workspaceId: conversation.workspaceId,
    uraId: decision.uraId,
    conversationId: conversation.id,
    variables: { ultima_resposta: job.text.trim() },
  });
  if (created) await advance(deps, conversation, created, null, null);
}

// Fim do prazo de um nó de espera ou fim de uma pausa. Timers de uma versão antiga
// (a sessão andou depois de agendado) são ignorados.
export async function handleTimer(job: TimerJob, deps: RunnerDeps) {
  const session = await deps.loadSession(job.sessionId);
  const expected = job.kind === "timeout" ? "waiting" : "sleeping";
  if (!session || session.version !== job.version || session.status !== expected || !session.currentNodeId) return;

  const conversation = await deps.loadConversation(session.conversationId);
  if (!conversation) return;

  await advance(deps, conversation, session, { nodeId: session.currentNodeId, resume: job.kind }, null);
}
