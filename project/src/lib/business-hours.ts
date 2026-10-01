// Horário de funcionamento da unidade, igual para todos os dias; "24:00" fecha à meia-noite.
export type BusinessHours = { opensAt: string; closesAt: string };

export type BusinessHoursError = "invalid_input" | "invalid_business_hours" | "invalid_business_hours_order";

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseBusinessHours(
  input: unknown,
): { ok: true; value: BusinessHours } | { ok: false; error: BusinessHoursError } {
  const { opensAt, closesAt } = (input ?? {}) as Record<string, unknown>;
  if (typeof opensAt !== "string" || typeof closesAt !== "string") return { ok: false, error: "invalid_input" };

  const opens = opensAt.trim();
  const closes = closesAt.trim();
  if (!TIME.test(opens) || (closes !== "24:00" && !TIME.test(closes))) {
    return { ok: false, error: "invalid_business_hours" };
  }
  // Com dois dígitos em cada parte, a ordem dos textos é a ordem dos horários.
  if (closes <= opens) return { ok: false, error: "invalid_business_hours_order" };
  return { ok: true, value: { opensAt: opens, closesAt: closes } };
}
