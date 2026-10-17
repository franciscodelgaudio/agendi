import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone";

const HORA_MS = 60 * 60 * 1000;

// Dia ("2026-10-17") de um instante no horário de Brasília (UTC-3 fixo).
export function diaEmBrasilia(instante: Date) {
  return new Date(instante.getTime() - BRT_OFFSET_HOURS * HORA_MS).toISOString().slice(0, 10);
}
