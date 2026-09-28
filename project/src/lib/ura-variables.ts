// Sem dependências de servidor: também é importado pelo editor de URAs.
import { BRT_OFFSET_HOURS } from "@/lib/timezone";

export type UraVariables = Record<string, string>;

const firstWord = (value: string) => value.trim().split(/\s+/)[0] ?? "";

const FILTERS: Record<string, (value: string) => string> = {
  primeiro_nome: firstWord,
  maiusculo: (value) => value.toUpperCase(),
  minusculo: (value) => value.toLowerCase(),
};

export const TEMPLATE_FILTERS = Object.keys(FILTERS);

// {{variavel}} ou {{variavel|filtro|filtro}}; variável ausente vira texto vazio.
export function resolveTemplate(template: string, variables: UraVariables) {
  return template.replace(/\{\{\s*([a-z_][a-z0-9_]*)((?:\s*\|\s*[a-z_]+)*)\s*\}\}/g, (_, name: string, filters: string) =>
    filters
      .split("|")
      .map((filter) => filter.trim())
      .filter(Boolean)
      .reduce((value, filter) => FILTERS[filter]?.(value) ?? value, variables[name] ?? ""),
  );
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const pad = (value: number) => String(value).padStart(2, "0");

// Data no fuso de Brasília, lida pelos métodos UTC.
export const toBrt = (date: Date) => new Date(date.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);

export const BUILTIN_VARIABLES = [
  "contato_nome",
  "contato_primeiro_nome",
  "contato_telefone",
  "data_atual",
  "hora_atual",
  "dia_semana",
  "dia_semana_num",
  "saudacao",
] as const;

export function builtinVariables(now: Date, contact: { name: string | null; phone: string | null }): UraVariables {
  const brt = toBrt(now);
  const hour = brt.getUTCHours();
  const name = contact.name?.trim() ?? "";
  return {
    contato_nome: name,
    contato_primeiro_nome: firstWord(name),
    contato_telefone: contact.phone ?? "",
    data_atual: `${pad(brt.getUTCDate())}/${pad(brt.getUTCMonth() + 1)}/${brt.getUTCFullYear()}`,
    hora_atual: `${pad(hour)}:${pad(brt.getUTCMinutes())}`,
    dia_semana: WEEKDAYS[brt.getUTCDay()],
    dia_semana_num: String(brt.getUTCDay()),
    saudacao: hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite",
  };
}
