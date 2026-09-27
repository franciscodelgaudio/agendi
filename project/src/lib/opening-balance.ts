import { parseDay } from "@/lib/appointment-list";
import type { DayRange } from "@/lib/cash-flow";
import { parsePriceCents } from "@/lib/service";

export type OpeningBalanceError = "invalid_input" | "invalid_opening_balance" | "invalid_opening_balance_date";

// Valor em caixa da unidade no início do dia `date` ("2026-09-01"); o saldo atual soma a
// ele o líquido real a partir desse dia.
export type OpeningBalance = { amountCents: number; date: string };

export type OpeningBalanceResult = { ok: true; value: OpeningBalance | null } | { ok: false; error: OpeningBalanceError };

// Sem valor, a unidade fica sem saldo inicial e o dia é ignorado.
export function parseOpeningBalance(input: unknown): OpeningBalanceResult {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== "object") return { ok: false, error: "invalid_input" };
  const { amount, date } = input as Record<string, unknown>;
  if (amount != null && typeof amount !== "string") return { ok: false, error: "invalid_input" };
  if (date != null && typeof date !== "string") return { ok: false, error: "invalid_input" };

  const normalizedAmount = amount?.trim();
  if (!normalizedAmount) return { ok: true, value: null };
  const amountCents = parsePriceCents(normalizedAmount);
  if (amountCents === null) return { ok: false, error: "invalid_opening_balance" };

  const day = date?.trim() ?? "";
  if (!parseDay(day)) return { ok: false, error: "invalid_opening_balance_date" };
  return { ok: true, value: { amountCents, date: day } };
}

// Dias cujo líquido real entra no saldo de hoje; null enquanto o saldo inicial é de um dia futuro.
export function openingBalanceRange({ date }: OpeningBalance, today: string): DayRange | null {
  return date <= today ? { from: date, to: today } : null;
}

export type UpdateOpeningBalanceResult = { ok: true } | { ok: false; error: OpeningBalanceError | "unit_not_found" };

// update devolve false quando a unidade não existe (ou não é do workspace).
export async function updateOpeningBalance(
  input: unknown,
  unitId: string | null | undefined,
  update: (unitId: string, openingBalance: OpeningBalance | null) => Promise<boolean>,
): Promise<UpdateOpeningBalanceResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = parseOpeningBalance(input);
  if (!parsed.ok) return parsed;

  const found = await update(unitId, parsed.value);
  return found ? { ok: true } : { ok: false, error: "unit_not_found" };
}
