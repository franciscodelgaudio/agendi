import { describe, it, expect } from "vitest";
import { evaluateCondition, isValidAnswer, matchOption } from "@/lib/ura-nodes";

describe("isValidAnswer", () => {
  it("sem validação aceita qualquer resposta", () => {
    expect(isValidAnswer("none", "qualquer coisa")).toBe(true);
    expect(isValidAnswer("none", "")).toBe(true);
  });

  it.each([
    ["number", "42", true],
    ["number", " 3,5 ", true],
    ["number", "-10.25", true],
    ["number", "dois", false],
    ["number", "", false],
    ["email", "ana@spa.com.br", true],
    ["email", " Ana.Souza+x@gmail.com ", true],
    ["email", "ana@", false],
    ["email", "ana spa@x.com", false],
    ["phone", "(11) 98888-7777", true],
    ["phone", "+55 11 98888 7777", true],
    ["phone", "1234", false],
    ["phone", "11 9888a-7777", false],
    ["date", "28/09", true],
    ["date", "28/09/2026", true],
    ["date", "31/02/2026", false],
    ["date", "29/02/2028", true],
    ["date", "amanhã", false],
  ] as const)("%s: %j → %s", (validation, text, expected) => {
    expect(isValidAnswer(validation, text)).toBe(expected);
  });
});

describe("evaluateCondition", () => {
  it("equals e not_equals ignoram maiúsculas, acentos e espaços nas pontas", () => {
    expect(evaluateCondition("equals", " Sim ", "sim")).toBe(true);
    expect(evaluateCondition("equals", "Não", "nao")).toBe(true);
    expect(evaluateCondition("equals", "talvez", "sim")).toBe(false);
    expect(evaluateCondition("not_equals", "talvez", "sim")).toBe(true);
  });

  it("contains e not_contains procuram o trecho normalizado", () => {
    expect(evaluateCondition("contains", "Quero uma MASSAGEM relaxante", "massagem")).toBe(true);
    expect(evaluateCondition("not_contains", "Quero uma massagem", "drenagem")).toBe(true);
  });

  it("exists e not_exists olham se há texto além de espaços", () => {
    expect(evaluateCondition("exists", "Ana", "")).toBe(true);
    expect(evaluateCondition("exists", "   ", "")).toBe(false);
    expect(evaluateCondition("not_exists", "", "")).toBe(true);
  });

  it("greater e less comparam números, com vírgula decimal", () => {
    expect(evaluateCondition("greater", "10", "9")).toBe(true);
    expect(evaluateCondition("greater", "2,5", "2,25")).toBe(true);
    expect(evaluateCondition("less", "9", "10")).toBe(true);
    expect(evaluateCondition("less", "10", "10")).toBe(false);
  });

  it("greater e less comparam como texto quando não são números, o que serve para horários HH:MM", () => {
    expect(evaluateCondition("greater", "18:30", "18:00")).toBe(true);
    expect(evaluateCondition("less", "08:59", "09:00")).toBe(true);
  });
});

describe("matchOption", () => {
  const options = [
    { id: "opt_0", title: "Agendar sessão" },
    { id: "opt_1", title: "Preços" },
    { id: "opt_2", title: "Falar com atendente" },
  ];

  it("reconhece o id da opção tocada no WhatsApp", () => {
    expect(matchOption(options, { text: "qualquer", optionId: "opt_1" })).toBe(1);
  });

  it("reconhece o número da opção digitado", () => {
    expect(matchOption(options, { text: " 3 ", optionId: null })).toBe(2);
  });

  it("reconhece o rótulo digitado, sem acentos nem maiúsculas", () => {
    expect(matchOption(options, { text: "precos", optionId: null })).toBe(1);
    expect(matchOption(options, { text: "AGENDAR SESSÃO", optionId: null })).toBe(0);
  });

  it("devolve null quando nada combina", () => {
    expect(matchOption(options, { text: "4", optionId: null })).toBeNull();
    expect(matchOption(options, { text: "0", optionId: null })).toBeNull();
    expect(matchOption(options, { text: "agendar", optionId: null })).toBeNull();
    expect(matchOption(options, { text: "x", optionId: "opt_9" })).toBeNull();
  });
});
