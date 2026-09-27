// Sem dependências de servidor: também é importado por componentes de cliente.
// Horário de Brasília: UTC-3 fixo (sem horário de verão desde 2019).
export const BRT_OFFSET_HOURS = 3;

// "2026-09-24" -> [2026, 9, 24]; null se o formato for outro ou o dia não existir.
export function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return [year, month, day] as const;
}
