import { describe, it, expect } from "vitest";
import { builtinVariables, resolveTemplate } from "@/service/workspace/[workspaceId]/uras/ura-variables";

describe("resolveTemplate", () => {
  it("troca {{variavel}} pelo valor, aceitando espaços dentro das chaves", () => {
    expect(resolveTemplate("Olá, {{nome}}! Seu horário é {{ horario }}.", { nome: "Ana", horario: "14:00" })).toBe(
      "Olá, Ana! Seu horário é 14:00.",
    );
  });

  it("troca variável que não existe por texto vazio", () => {
    expect(resolveTemplate("Oi {{nome}}!", {})).toBe("Oi !");
  });

  it("aplica os filtros primeiro_nome, maiusculo e minusculo, em sequência", () => {
    const variables = { nome: "  maria clara souza " };
    expect(resolveTemplate("{{nome|primeiro_nome}}", variables)).toBe("maria");
    expect(resolveTemplate("{{nome|primeiro_nome|maiusculo}}", variables)).toBe("MARIA");
    expect(resolveTemplate("{{ nome | minusculo }}", { nome: "ANA" })).toBe("ana");
  });

  it("ignora filtro desconhecido", () => {
    expect(resolveTemplate("{{nome|inexistente}}", { nome: "Ana" })).toBe("Ana");
  });

  it("mantém texto sem chaves e chaves malformadas como estão", () => {
    expect(resolveTemplate("Sem variáveis { nome } {{}}", { nome: "Ana" })).toBe("Sem variáveis { nome } {{}}");
  });
});

describe("builtinVariables", () => {
  it("monta data, hora, dia da semana e saudação no horário de Brasília", () => {
    // 12:30 UTC = 09:30 em Brasília, segunda-feira.
    const vars = builtinVariables(new Date("2026-09-28T12:30:00.000Z"), { name: "Maria Clara", phone: "5511988887777" });

    expect(vars).toEqual({
      contato_nome: "Maria Clara",
      contato_primeiro_nome: "Maria",
      contato_telefone: "5511988887777",
      data_atual: "28/09/2026",
      hora_atual: "09:30",
      dia_semana: "segunda-feira",
      dia_semana_num: "1",
      saudacao: "Bom dia",
    });
  });

  it("usa o dia de Brasília quando em UTC já é o dia seguinte", () => {
    const vars = builtinVariables(new Date("2026-09-29T02:30:00.000Z"), { name: null, phone: null });

    expect(vars.data_atual).toBe("28/09/2026");
    expect(vars.hora_atual).toBe("23:30");
    expect(vars.dia_semana).toBe("segunda-feira");
    expect(vars.saudacao).toBe("Boa noite");
    expect(vars.contato_nome).toBe("");
    expect(vars.contato_primeiro_nome).toBe("");
    expect(vars.contato_telefone).toBe("");
  });

  it("dá boa tarde do meio-dia às 17:59 e boa noite a partir das 18h", () => {
    const contact = { name: "Ana", phone: null };
    expect(builtinVariables(new Date("2026-09-27T15:00:00.000Z"), contact).saudacao).toBe("Boa tarde");
    expect(builtinVariables(new Date("2026-09-27T20:59:00.000Z"), contact).saudacao).toBe("Boa tarde");
    expect(builtinVariables(new Date("2026-09-27T21:00:00.000Z"), contact).saudacao).toBe("Boa noite");
    // Domingo.
    expect(builtinVariables(new Date("2026-09-27T15:00:00.000Z"), contact).dia_semana_num).toBe("0");
  });
});
