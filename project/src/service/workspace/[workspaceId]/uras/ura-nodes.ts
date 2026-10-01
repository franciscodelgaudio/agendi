// Sem dependências de servidor: também é importado pelo editor de URAs.
// Tipos de nó da URA, os dados de cada um e as regras que não dependem do fluxo.

export const URA_NODE_TYPES = [
  "start",
  "sendMessage",
  "sendMedia",
  "waitForReply",
  "menu",
  "condition",
  "setVariable",
  "goTo",
  "delay",
  "closeConversation",
  "handoff",
  "chooseService",
  "chooseSlot",
  "createBooking",
] as const;
export type UraNodeType = (typeof URA_NODE_TYPES)[number];

export const URA_TRIGGERS = ["new_conversation", "keyword", "any_message"] as const;
export type UraTrigger = (typeof URA_TRIGGERS)[number];

export const ANSWER_VALIDATIONS = ["none", "number", "email", "phone", "date"] as const;
export type AnswerValidation = (typeof ANSWER_VALIDATIONS)[number];

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "greater",
  "less",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const MEDIA_TYPES = ["image", "video", "audio", "document"] as const;
export type UraMediaType = (typeof MEDIA_TYPES)[number];

// Limites do WhatsApp: lista com até 10 linhas e título de linha com até 24 caracteres.
export const MAX_MENU_OPTIONS = 10;
export const MAX_OPTION_LABEL = 24;
export const MAX_RETRIES = 5;
export const MAX_TIMEOUT_MINUTES = 7 * 24 * 60;
export const MAX_DELAY_SECONDS = 24 * 60 * 60;
export const MAX_DAYS_AHEAD = 14;
const MAX_TEXT = 4096;
const MAX_KEYWORDS = 20;

export type StartData = { trigger: UraTrigger; keywords: string[]; channelIds: string[] };
export type WaitSettings = { retryMessage: string; maxRetries: number; timeoutMinutes: number };

export type UraNodeData = {
  start: StartData;
  sendMessage: { text: string };
  sendMedia: { mediaType: UraMediaType; url: string; caption: string };
  waitForReply: {
    message: string;
    variable: string;
    validation: AnswerValidation;
    errorMessage: string;
    maxRetries: number;
    timeoutMinutes: number;
  };
  menu: { message: string; buttonLabel: string; options: { label: string }[]; variable: string } & WaitSettings;
  condition: { variable: string; operator: ConditionOperator; value: string };
  setVariable: { variable: string; value: string };
  goTo: { targetNodeId: string };
  delay: { seconds: number };
  closeConversation: { message: string };
  handoff: { userId: string | null; message: string };
  chooseService: { unitId: string | null; message: string; buttonLabel: string } & WaitSettings;
  chooseSlot: { message: string; buttonLabel: string; daysAhead: number } & WaitSettings;
  createBooking: { guestName: string; guestRoom: string };
};

type Raw = Record<string, unknown>;

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const VARIABLE_NAME = /^[a-z_][a-z0-9_]{0,39}$/;

export const isVariableName = (value: string) => VARIABLE_NAME.test(value);

function text(value: unknown, fallback = "", max = MAX_TEXT) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function variable(value: unknown) {
  const name = text(value);
  return isVariableName(name) ? name : "";
}

function objectId(value: unknown) {
  return typeof value === "string" && OBJECT_ID.test(value) ? value : null;
}

function waitSettings(raw: Raw, defaultRetry: string): WaitSettings {
  return {
    retryMessage: text(raw.retryMessage, defaultRetry),
    maxRetries: int(raw.maxRetries, 2, 0, MAX_RETRIES),
    timeoutMinutes: int(raw.timeoutMinutes, 0, 0, MAX_TIMEOUT_MINUTES),
  };
}

// Completa e limpa os dados de um nó: campos ausentes ou inválidos ficam com o padrão.
export function normalizeNodeData<T extends UraNodeType>(type: T, input: unknown): UraNodeData[T] {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Raw;
  const data: { [K in UraNodeType]: () => UraNodeData[K] } = {
    start: () => ({
      trigger: oneOf(raw.trigger, URA_TRIGGERS, "new_conversation"),
      keywords: (Array.isArray(raw.keywords) ? raw.keywords : [])
        .map((k) => text(k, "", 60))
        .filter(Boolean)
        .slice(0, MAX_KEYWORDS),
      channelIds: (Array.isArray(raw.channelIds) ? raw.channelIds : []).map(objectId).filter((id) => id !== null),
    }),
    sendMessage: () => ({ text: text(raw.text) }),
    sendMedia: () => ({
      mediaType: oneOf(raw.mediaType, MEDIA_TYPES, "image"),
      url: text(raw.url, "", 2000),
      caption: text(raw.caption, "", 1024),
    }),
    waitForReply: () => ({
      message: text(raw.message),
      variable: variable(raw.variable),
      validation: oneOf(raw.validation, ANSWER_VALIDATIONS, "none"),
      errorMessage: text(raw.errorMessage),
      maxRetries: int(raw.maxRetries, 2, 0, MAX_RETRIES),
      timeoutMinutes: int(raw.timeoutMinutes, 0, 0, MAX_TIMEOUT_MINUTES),
    }),
    menu: () => ({
      message: text(raw.message),
      buttonLabel: text(raw.buttonLabel, "", 20) || "Ver opções",
      options: (Array.isArray(raw.options) ? raw.options : [])
        .map((option) => ({ label: text((option as Raw | null)?.label, "", MAX_OPTION_LABEL).trim() }))
        .filter((option) => option.label)
        .slice(0, MAX_MENU_OPTIONS),
      variable: variable(raw.variable),
      ...waitSettings(raw, "Não entendi. Escolha uma das opções."),
    }),
    condition: () => ({
      variable: variable(raw.variable),
      operator: oneOf(raw.operator, CONDITION_OPERATORS, "equals"),
      value: text(raw.value),
    }),
    setVariable: () => ({ variable: variable(raw.variable), value: text(raw.value) }),
    goTo: () => ({ targetNodeId: text(raw.targetNodeId, "", 64) }),
    delay: () => ({ seconds: int(raw.seconds, 5, 1, MAX_DELAY_SECONDS) }),
    closeConversation: () => ({ message: text(raw.message) }),
    handoff: () => ({ userId: objectId(raw.userId), message: text(raw.message) }),
    chooseService: () => ({
      unitId: objectId(raw.unitId),
      message: text(raw.message, "Qual serviço você quer?"),
      buttonLabel: text(raw.buttonLabel, "", 20) || "Serviços",
      ...waitSettings(raw, "Não entendi. Escolha um dos serviços."),
    }),
    chooseSlot: () => ({
      message: text(raw.message, "Escolha um horário:"),
      buttonLabel: text(raw.buttonLabel, "", 20) || "Horários",
      daysAhead: int(raw.daysAhead, 7, 1, MAX_DAYS_AHEAD),
      ...waitSettings(raw, "Não entendi. Escolha um dos horários."),
    }),
    createBooking: () => ({
      guestName: text(raw.guestName, "{{contato_nome}}", 200),
      guestRoom: text(raw.guestRoom, "", 200),
    }),
  };
  return data[type]();
}

export function defaultNodeData<T extends UraNodeType>(type: T): UraNodeData[T] {
  return normalizeNodeData(type, {});
}

// Minúsculas, sem acentos e sem espaços nas pontas: base das comparações com o que o cliente digita.
export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[\d\s()+-]+$/;
const DATE = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/;

function isValidDate(value: string) {
  const match = DATE.exec(value);
  if (!match) return false;
  const [day, month] = [Number(match[1]), Number(match[2])];
  // Sem ano, 29/02 vale: o ano bissexto 2000 serve de referência.
  const year = match[3] ? Number(match[3]) : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidAnswer(validation: AnswerValidation, answer: string) {
  const value = answer.trim();
  switch (validation) {
    case "none":
      return true;
    case "number":
      return NUMBER.test(value);
    case "email":
      return EMAIL.test(value);
    case "phone": {
      const digits = value.replace(/\D/g, "").length;
      return PHONE.test(value) && digits >= 10 && digits <= 13;
    }
    case "date":
      return isValidDate(value);
  }
}

const toNumber = (value: string) => (NUMBER.test(value.trim()) ? Number(value.trim().replace(",", ".")) : null);

export function evaluateCondition(operator: ConditionOperator, left: string, right: string) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  switch (operator) {
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "not_contains":
      return !a.includes(b);
    case "exists":
      return a !== "";
    case "not_exists":
      return a === "";
    case "greater":
    case "less": {
      const [x, y] = [toNumber(left), toNumber(right)];
      const diff = x !== null && y !== null ? x - y : a < b ? -1 : a > b ? 1 : 0;
      return operator === "greater" ? diff > 0 : diff < 0;
    }
  }
}

// Índice da opção escolhida: pelo id do botão/lista, pelo número digitado ou pelo rótulo.
export function matchOption(options: readonly { id: string; title: string }[], reply: { text: string; optionId: string | null }) {
  if (reply.optionId) {
    const index = options.findIndex((option) => option.id === reply.optionId);
    if (index >= 0) return index;
  }
  const answer = reply.text.trim();
  if (/^\d+$/.test(answer)) {
    const index = Number(answer) - 1;
    return index >= 0 && index < options.length ? index : null;
  }
  const normalized = normalizeText(answer);
  const index = options.findIndex((option) => normalizeText(option.title) === normalized);
  return index >= 0 ? index : null;
}
