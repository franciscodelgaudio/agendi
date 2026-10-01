import { nextNodeId, type UraGraph, type UraNode } from "@/service/workspace/[workspaceId]/uras/ura-graph";
import { evaluateCondition, isValidAnswer, matchOption, type UraMediaType, type WaitSettings } from "@/service/workspace/[workspaceId]/uras/ura-nodes";
import { resolveTemplate, toBrt, type UraVariables } from "@/service/workspace/[workspaceId]/uras/ura-variables";

// Nós executados numa rodada; passar disso encerra o fluxo (laços de "Ir para").
export const MAX_STEPS = 50;
const MINUTE_MS = 60 * 1000;
const DEFAULT_INVALID_ANSWER = "Resposta inválida. Tente novamente.";
const DEFAULT_MENU_TEXT = "Escolha uma opção:";

export type MenuOption = { id: string; title: string; description: string | null };

// Mensagem que a URA manda. O menu vira botões ou lista no WhatsApp e texto numerado no Instagram.
export type Outgoing =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaType: UraMediaType; url: string; caption: string | null }
  | { kind: "menu"; text: string; buttonLabel: string; options: MenuOption[] };

export type WalkState =
  | { status: "waiting"; nodeId: string; timeoutAt: Date | null }
  // nodeId é o nó que roda ao acordar.
  | { status: "sleeping"; nodeId: string; wakeAt: Date }
  | { status: "ended"; reason: "completed" | "closed" | "limit" }
  | { status: "ended"; reason: "handoff"; assignUserId: string | null };

export type WalkResult = { outgoing: Outgoing[]; variables: UraVariables; state: WalkState; trace: string[] };

export type ServiceOption = { id: string; name: string; priceCents: number; durationMinutes: number };
export type SlotOption = { startsAt: Date; therapistId: string; therapistName: string; roomId: string; roomName: string };

export type WalkDeps = {
  listServices: (unitId: string) => Promise<ServiceOption[]>;
  findSlots: (query: { unitId: string; serviceId: string; durationMinutes: number; from: Date; days: number }) => Promise<SlotOption[]>;
  createBooking: (data: {
    unitId: string;
    serviceId: string;
    therapistId: string;
    roomId: string;
    startsAt: Date;
    guestName: string;
    guestRoom: string;
  }) => Promise<{ ok: true; bookingId: string } | { ok: false }>;
};

export type WalkInput = {
  graph: UraGraph;
  // null começa pelo início. reply: resposta ao nó de espera; timeout: prazo do nó de
  // espera acabou; wake: roda o nó do zero (fim de pausa).
  position: { nodeId: string; resume: "reply" | "timeout" | "wake" } | null;
  reply: { text: string; optionId: string | null } | null;
  variables: UraVariables;
  builtins: UraVariables;
  now: Date;
};

type Step =
  | { handle: string }
  | { jump: string }
  | { wait: number }
  | { sleep: number }
  | { end: "closed" }
  | { end: "handoff"; assignUserId: string | null };

// Opção de menu guardada na sessão entre o envio e a resposta, com os dados da escolha.
type StoredOption = MenuOption & { values: UraVariables };

const retriesKey = (nodeId: string) => `_retries_${nodeId}`;
const optionsKey = (nodeId: string) => `_options_${nodeId}`;

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatPrice(cents: number) {
  const [integer, decimal] = (cents / 100).toFixed(2).split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
}

function slotTexts(startsAt: Date) {
  const brt = toBrt(startsAt);
  const day = `${pad(brt.getUTCDate())}/${pad(brt.getUTCMonth() + 1)}`;
  const time = `${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}`;
  return { title: `${WEEKDAYS[brt.getUTCDay()]} ${day} ${time}`, text: `${day} às ${time}` };
}

// Percorre o fluxo a partir da posição até precisar esperar o cliente, dormir ou terminar.
// Não grava nada: devolve as mensagens a enviar e o novo estado da sessão.
export async function walkUra(input: WalkInput, deps: WalkDeps): Promise<WalkResult> {
  const { graph, now, builtins } = input;
  const variables: UraVariables = { ...input.variables };
  const outgoing: Outgoing[] = [];
  const trace: string[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  const template = (value: string) => resolveTemplate(value, { ...builtins, ...variables });
  const sendText = (value: string) => {
    const text = template(value).trim();
    if (text) outgoing.push({ kind: "text", text });
  };
  const clearNodeState = (nodeId: string) => {
    delete variables[retriesKey(nodeId)];
    delete variables[optionsKey(nodeId)];
  };
  const storedOptions = (nodeId: string): StoredOption[] => {
    try {
      const parsed: unknown = JSON.parse(variables[optionsKey(nodeId)] ?? "[]");
      return Array.isArray(parsed) ? (parsed as StoredOption[]) : [];
    } catch {
      return [];
    }
  };
  const sendMenu = (message: string, buttonLabel: string, options: MenuOption[]) => {
    outgoing.push({
      kind: "menu",
      text: template(message).trim() || DEFAULT_MENU_TEXT,
      buttonLabel,
      options: options.map(({ id, title, description }) => ({ id, title, description })),
    });
  };
  const offerOptions = (node: UraNode, message: string, buttonLabel: string, options: StoredOption[], minutes: number): Step => {
    variables[optionsKey(node.id)] = JSON.stringify(options);
    sendMenu(message, buttonLabel, options);
    return { wait: minutes };
  };
  // Resposta que não serviu: avisa e espera de novo, ou segue pela saída inválida.
  const retry = (node: UraNode, retryMessage: string, maxRetries: number, minutes: number, resend?: () => void): Step => {
    const attempts = Number(variables[retriesKey(node.id)] ?? 0) + 1;
    if (attempts > maxRetries) {
      clearNodeState(node.id);
      return { handle: "invalid" };
    }
    variables[retriesKey(node.id)] = String(attempts);
    sendText(retryMessage);
    resend?.();
    return { wait: minutes };
  };
  // Escolha entre opções guardadas na sessão (menu de serviços ou de horários).
  const answerOptions = (
    node: UraNode,
    answer: NonNullable<WalkInput["reply"]>,
    { retryMessage, maxRetries, timeoutMinutes }: WaitSettings,
    message: string,
    buttonLabel: string,
  ): Step => {
    const options = storedOptions(node.id);
    if (!options.length) return { handle: "empty" };
    const index = matchOption(options, answer);
    if (index === null) {
      return retry(node, retryMessage, maxRetries, timeoutMinutes, () => sendMenu(message, buttonLabel, options));
    }
    clearNodeState(node.id);
    Object.assign(variables, options[index].values);
    return { handle: "default" };
  };

  async function runNode(node: UraNode, resume: "reply" | "timeout" | null, answer: WalkInput["reply"]): Promise<Step> {
    const waitNode = node.type === "waitForReply" || node.type === "menu" || node.type === "chooseService" || node.type === "chooseSlot";
    if (waitNode && resume === "timeout") {
      clearNodeState(node.id);
      return { handle: "timeout" };
    }
    const reply = waitNode && resume === "reply" && answer ? answer : null;
    if (reply) variables.ultima_resposta = reply.text.trim();

    switch (node.type) {
      case "start":
        return { handle: "default" };

      case "sendMessage":
        sendText(node.data.text);
        return { handle: "default" };

      case "sendMedia": {
        const url = template(node.data.url).trim();
        if (url) outgoing.push({ kind: "media", mediaType: node.data.mediaType, url, caption: template(node.data.caption).trim() || null });
        return { handle: "default" };
      }

      case "waitForReply": {
        const { message, variable, validation, errorMessage, maxRetries, timeoutMinutes } = node.data;
        if (!reply) {
          sendText(message);
          return { wait: timeoutMinutes };
        }
        if (!isValidAnswer(validation, reply.text)) {
          return retry(node, errorMessage || DEFAULT_INVALID_ANSWER, maxRetries, timeoutMinutes);
        }
        clearNodeState(node.id);
        if (variable) variables[variable] = reply.text.trim();
        return { handle: "default" };
      }

      case "menu": {
        const { message, buttonLabel, variable, retryMessage, maxRetries, timeoutMinutes } = node.data;
        const options = node.data.options.map((option, i) => ({ id: `opt_${i}`, title: option.label, description: null }));
        if (!reply) {
          sendMenu(message, buttonLabel, options);
          return { wait: timeoutMinutes };
        }
        const index = matchOption(options, reply);
        if (index === null) {
          return retry(node, retryMessage, maxRetries, timeoutMinutes, () => sendMenu(message, buttonLabel, options));
        }
        clearNodeState(node.id);
        if (variable) variables[variable] = options[index].title;
        return { handle: `option_${index}` };
      }

      case "condition": {
        const left = { ...builtins, ...variables }[node.data.variable] ?? "";
        return { handle: evaluateCondition(node.data.operator, left, template(node.data.value)) ? "true" : "false" };
      }

      case "setVariable":
        if (node.data.variable) variables[node.data.variable] = template(node.data.value);
        return { handle: "default" };

      case "goTo":
        return { jump: node.data.targetNodeId };

      case "delay":
        return { sleep: node.data.seconds };

      case "closeConversation":
        sendText(node.data.message);
        return { end: "closed" };

      case "handoff":
        sendText(node.data.message);
        return { end: "handoff", assignUserId: node.data.userId };

      case "chooseService": {
        const { unitId, message, buttonLabel, timeoutMinutes } = node.data;
        if (reply) return answerOptions(node, reply, node.data, message, buttonLabel);
        if (!unitId) return { handle: "empty" };
        const services = await deps.listServices(unitId);
        if (!services.length) return { handle: "empty" };
        const options = services.map((service) => ({
          id: `svc_${service.id}`,
          title: service.name.slice(0, 24),
          description: `${formatPrice(service.priceCents)} · ${service.durationMinutes} min`,
          values: {
            unidade_id: unitId,
            servico_id: service.id,
            servico_nome: service.name,
            servico_preco: formatPrice(service.priceCents),
            servico_duracao: String(service.durationMinutes),
          },
        }));
        return offerOptions(node, message, buttonLabel, options, timeoutMinutes);
      }

      case "chooseSlot": {
        const { message, buttonLabel, daysAhead, timeoutMinutes } = node.data;
        if (reply) return answerOptions(node, reply, node.data, message, buttonLabel);
        const { unidade_id: unitId, servico_id: serviceId } = variables;
        const durationMinutes = Number(variables.servico_duracao);
        if (!unitId || !serviceId || !(durationMinutes > 0)) return { handle: "empty" };
        const slots = await deps.findSlots({ unitId, serviceId, durationMinutes, from: now, days: daysAhead });
        if (!slots.length) return { handle: "empty" };
        const options = slots.map((slot, i) => {
          const texts = slotTexts(slot.startsAt);
          return {
            id: `slot_${i}`,
            title: texts.title,
            description: `com ${slot.therapistName}`,
            values: {
              horario_inicio: slot.startsAt.toISOString(),
              horario_texto: texts.text,
              terapeuta_id: slot.therapistId,
              terapeuta_nome: slot.therapistName,
              sala_id: slot.roomId,
            },
          };
        });
        return offerOptions(node, message, buttonLabel, options, timeoutMinutes);
      }

      case "createBooking": {
        const { unidade_id, servico_id, terapeuta_id, sala_id, horario_inicio } = variables;
        const startsAt = horario_inicio ? new Date(horario_inicio) : null;
        if (!unidade_id || !servico_id || !terapeuta_id || !sala_id || !startsAt || Number.isNaN(startsAt.getTime())) {
          return { handle: "error" };
        }
        const result = await deps.createBooking({
          unitId: unidade_id,
          serviceId: servico_id,
          therapistId: terapeuta_id,
          roomId: sala_id,
          startsAt,
          guestName: template(node.data.guestName).trim(),
          guestRoom: template(node.data.guestRoom).trim(),
        });
        if (!result.ok) return { handle: "error" };
        variables.agendamento_id = result.bookingId;
        return { handle: "default" };
      }
    }
  }

  const finish = (state: WalkState): WalkResult => ({ outgoing, variables, state, trace });

  const start = graph.nodes.find((node) => node.type === "start");
  let current: string | null = input.position ? input.position.nodeId : (start?.id ?? null);
  let resume: "reply" | "timeout" | null = input.position && input.position.resume !== "wake" ? input.position.resume : null;

  while (current) {
    const node = byId.get(current);
    if (!node) break;
    if (trace.length >= MAX_STEPS) return finish({ status: "ended", reason: "limit" });
    trace.push(node.id);

    // Só o primeiro nó da rodada recebe a resposta ou o fim de prazo.
    const step = await runNode(node, resume, input.reply);
    resume = null;

    if ("handle" in step) current = nextNodeId(graph, node.id, step.handle);
    else if ("jump" in step) current = step.jump;
    else if ("wait" in step) {
      const timeoutAt = step.wait > 0 ? new Date(now.getTime() + step.wait * MINUTE_MS) : null;
      return finish({ status: "waiting", nodeId: node.id, timeoutAt });
    } else if ("sleep" in step) {
      const next = nextNodeId(graph, node.id, "default");
      if (!next) break;
      return finish({ status: "sleeping", nodeId: next, wakeAt: new Date(now.getTime() + step.sleep * 1000) });
    } else if (step.end === "handoff") {
      return finish({ status: "ended", reason: "handoff", assignUserId: step.assignUserId });
    } else {
      return finish({ status: "ended", reason: step.end });
    }
  }
  return finish({ status: "ended", reason: "completed" });
}
