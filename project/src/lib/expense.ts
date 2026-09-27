import type { PipelineStage } from "mongoose";
import { parseDay } from "@/lib/appointment-list";
import type { DayRange, ExpenseDayCents } from "@/lib/cash-flow";
import { parsePriceCents } from "@/lib/service";

const MAX_DESCRIPTION_LENGTH = 80;

export type ExpenseInputError =
  | "invalid_input"
  | "invalid_description"
  | "description_too_long"
  | "invalid_amount"
  | "invalid_date"
  | "group_not_found";

// date é o dia do lançamento ("2026-09-20"), que define em que período a despesa entra no caixa.
export type ExpenseData = { groupId: string; description: string; amountCents: number; date: string };

// Confere se o grupo existe na unidade.
type GroupExists = (unitId: string, groupId: string) => Promise<boolean>;

// Valida e normaliza os campos como chegam do FormData; o checkbox "paid" é lido por quem cria.
async function parseExpenseInput(
  input: unknown,
  unitId: string,
  groupExists: GroupExists,
): Promise<({ ok: true } & ExpenseData) | { ok: false; error: ExpenseInputError }> {
  const { groupId, description, amount, date } = (input ?? {}) as Record<string, unknown>;
  if (
    typeof groupId !== "string" ||
    typeof description !== "string" ||
    typeof amount !== "string" ||
    typeof date !== "string"
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedDescription = description.trim();
  if (!normalizedDescription) return { ok: false, error: "invalid_description" };
  if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) return { ok: false, error: "description_too_long" };

  const amountCents = parsePriceCents(amount.trim());
  if (!amountCents) return { ok: false, error: "invalid_amount" };

  const day = date.trim();
  if (!parseDay(day)) return { ok: false, error: "invalid_date" };

  if (!groupId || !(await groupExists(unitId, groupId))) return { ok: false, error: "group_not_found" };

  return { ok: true, groupId, description: normalizedDescription, amountCents, date: day };
}

const MAX_SERIES_COUNT = 60;

export const EXPENSE_REPEATS = ["installments", "recurring"] as const;

// installments: o valor informado é o total, dividido entre os meses. recurring: o mesmo valor
// todo mês. number vai de 1 a count.
export type ExpenseSeries = { id: string; kind: (typeof EXPENSE_REPEATS)[number]; number: number; count: number };

// Esta despesa ou esta e as próximas da mesma série.
export type ExpenseScope = "this" | "following";

function parseScope(value: unknown): ExpenseScope {
  return value === "following" ? "following" : "this";
}

// Divide o total em centavos inteiros; os centavos que sobram ficam na primeira parcela.
export function splitInstallments(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => (index === 0 ? totalCents - base * (count - 1) : base));
}

// O mesmo dia em meses seguidos; em meses mais curtos, o último dia do mês.
export function monthlyDates(first: string, count: number) {
  const [year, month, day] = parseDay(first)!;
  return Array.from({ length: count }, (_, index) => {
    const lastDay = new Date(Date.UTC(year, month + index, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1 + index, Math.min(day, lastDay))).toISOString().slice(0, 10);
  });
}

type SeriesInput = { ok: true; kind: ExpenseSeries["kind"] | null; count: number } | { ok: false; error: "invalid_input" | "invalid_count" };

// Sem repetição (vazio ou "none"), um lançamento só e a quantidade é ignorada.
function parseSeriesInput(repeat: unknown, count: unknown): SeriesInput {
  if (repeat == null || repeat === "" || repeat === "none") return { ok: true, kind: null, count: 1 };
  if (!EXPENSE_REPEATS.includes(repeat as ExpenseSeries["kind"])) return { ok: false, error: "invalid_input" };
  if (count != null && typeof count !== "string") return { ok: false, error: "invalid_input" };
  const value = count?.trim() ?? "";
  if (!/^\d+$/.test(value)) return { ok: false, error: "invalid_count" };
  const n = Number(value);
  if (n < 2 || n > MAX_SERIES_COUNT) return { ok: false, error: "invalid_count" };
  return { ok: true, kind: repeat as ExpenseSeries["kind"], count: n };
}

export type ExpenseEntry = ExpenseData & { unitId: string; paidAt: Date | null; series: ExpenseSeries | null };

export type CreateExpenseError = ExpenseInputError | "invalid_count" | "unit_not_found";

export type CreateExpenseResult = { ok: true; expenseIds: string[] } | { ok: false; error: CreateExpenseError };

// Uma série grava todos os lançamentos de uma vez; marcada como paga, só o primeiro fica pago.
export async function createExpense(
  input: unknown,
  unitId: string | null | undefined,
  {
    insert,
    groupExists,
    newSeriesId,
    now,
  }: {
    insert: (entries: ExpenseEntry[]) => Promise<string[]>;
    groupExists: GroupExists;
    newSeriesId: () => string;
    now: Date;
  },
): Promise<CreateExpenseResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = await parseExpenseInput(input, unitId, groupExists);
  if (!parsed.ok) return parsed;
  const { repeat, count, paid } = input as Record<string, unknown>;
  const series = parseSeriesInput(repeat, count);
  if (!series.ok) return series;

  const { groupId, description, amountCents, date } = parsed;
  const amounts =
    series.kind === "installments"
      ? splitInstallments(amountCents, series.count)
      : Array<number>(series.count).fill(amountCents);
  if (amounts.some((cents) => cents < 1)) return { ok: false, error: "invalid_amount" };

  const seriesId = series.kind && newSeriesId();
  const entries = monthlyDates(date, series.count).map((day, index) => ({
    unitId,
    groupId,
    description,
    amountCents: amounts[index],
    date: day,
    paidAt: paid === "on" && index === 0 ? now : null,
    series: series.kind && { id: seriesId!, kind: series.kind, number: index + 1, count: series.count },
  }));
  return { ok: true, expenseIds: await insert(entries) };
}

export type UpdateExpenseError = ExpenseInputError | "expense_not_found";

export type UpdateExpenseResult = { ok: true } | { ok: false; error: UpdateExpenseError };

// O pagamento só muda por setExpensePaid. Nesta e nas próximas, cada uma mantém o seu dia.
// update devolve false quando a despesa não existe (ou não é da unidade).
export async function updateExpense(
  input: unknown,
  unitId: string | null | undefined,
  expenseId: string | null | undefined,
  {
    update,
    groupExists,
  }: {
    update: (expenseId: string, data: Omit<ExpenseData, "date"> & { date?: string }, scope: ExpenseScope) => Promise<boolean>;
    groupExists: GroupExists;
  },
): Promise<UpdateExpenseResult> {
  if (!unitId || !expenseId) return { ok: false, error: "expense_not_found" };

  const parsed = await parseExpenseInput(input, unitId, groupExists);
  if (!parsed.ok) return parsed;

  const { groupId, description, amountCents, date } = parsed;
  const scope = parseScope((input as Record<string, unknown>).scope);
  const data = scope === "following" ? { groupId, description, amountCents } : { groupId, description, amountCents, date };
  const found = await update(expenseId, data, scope);
  return found ? { ok: true } : { ok: false, error: "expense_not_found" };
}

export type ExpenseResult = { ok: true } | { ok: false; error: "expense_not_found" };

// update devolve false quando a despesa não existe (ou não é da unidade).
export async function setExpensePaid(
  expenseId: string | null | undefined,
  paid: boolean,
  { update, now }: { update: (expenseId: string, paidAt: Date | null) => Promise<boolean>; now: Date },
): Promise<ExpenseResult> {
  if (!expenseId) return { ok: false, error: "expense_not_found" };

  const found = await update(expenseId, paid ? now : null);
  return found ? { ok: true } : { ok: false, error: "expense_not_found" };
}

// remove devolve false quando a despesa não existe (ou não é da unidade).
export async function deleteExpense(
  expenseId: string | null | undefined,
  scope: unknown,
  remove: (expenseId: string, scope: ExpenseScope) => Promise<boolean>,
): Promise<ExpenseResult> {
  if (!expenseId) return { ok: false, error: "expense_not_found" };

  const found = await remove(expenseId, parseScope(scope));
  return found ? { ok: true } : { ok: false, error: "expense_not_found" };
}

// Total lançado e quanto dele já foi pago, num dia ou num grupo.
export type ExpenseDayTotal = ExpenseDayCents;
export type ExpenseGroupTotal = { groupId: string; totalCents: number; paidCents: number };

function expenseTotalsStages({ from, to }: DayRange, key: string): PipelineStage[] {
  return [
    { $match: { date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: key,
        totalCents: { $sum: "$amountCents" },
        paidCents: { $sum: { $cond: [{ $ne: ["$paidAt", null] }, "$amountCents", 0] } },
      },
    },
  ];
}

// Etapas para as despesas da unidade: total e pago por dia do lançamento.
export function dailyExpenseTotalsPipeline(range: DayRange): PipelineStage[] {
  return [...expenseTotalsStages(range, "$date"), { $project: { _id: 0, date: "$_id", totalCents: 1, paidCents: 1 } }];
}

// Etapas para as despesas da unidade: total e pago por grupo no intervalo.
export function expenseGroupTotalsPipeline(range: DayRange): PipelineStage[] {
  return [
    ...expenseTotalsStages(range, "$groupId"),
    { $project: { _id: 0, groupId: { $toString: "$_id" }, totalCents: 1, paidCents: 1 } },
  ];
}

export type ExpenseGroupInfo = { id: string; name: string; monthlyLimitCents: number | null };
export type ExpenseGroupSummary = ExpenseGroupInfo & { totalCents: number; paidCents: number; overLimit: boolean };

// Passa do limite pelo total lançado, pago ou não: o limite é do gasto previsto no mês.
export function summarizeExpenseGroups(groups: ExpenseGroupInfo[], totals: ExpenseGroupTotal[]): ExpenseGroupSummary[] {
  const byGroup = new Map(totals.map((total) => [total.groupId, total]));
  return groups
    .map((group) => {
      const { totalCents = 0, paidCents = 0 } = byGroup.get(group.id) ?? {};
      const overLimit = group.monthlyLimitCents !== null && totalCents > group.monthlyLimitCents;
      return { ...group, totalCents, paidCents, overLimit };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
