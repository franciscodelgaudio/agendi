import { parsePriceCents } from "@/lib/service";

const MAX_NAME_LENGTH = 40;

export type ExpenseGroupInputError = "invalid_input" | "invalid_name" | "name_too_long" | "invalid_monthly_limit" | "invalid_icon";

// monthlyLimitCents é null quando o grupo não tem limite de gasto por mês.
export type ExpenseGroupData = { name: string; monthlyLimitCents: number | null; iconId: string };

// Confere se outro grupo da unidade já usa o nome; excludeId é o próprio grupo na edição.
type IsNameTaken = (unitId: string, name: string, excludeId: string | null) => Promise<boolean>;

// Confere se o ícone está no catálogo.
type IconExists = (iconId: string) => Promise<boolean>;

// Valida e normaliza os campos como chegam do FormData; limite vazio vira null.
function parseExpenseGroupInput(input: unknown): ({ ok: true } & ExpenseGroupData) | { ok: false; error: ExpenseGroupInputError } {
  const { name, monthlyLimit, iconId } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  if (monthlyLimit != null && typeof monthlyLimit !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const limit = monthlyLimit?.trim();
  const monthlyLimitCents = limit ? parsePriceCents(limit) : null;
  if (limit && !monthlyLimitCents) return { ok: false, error: "invalid_monthly_limit" };

  if (typeof iconId !== "string" || !iconId) return { ok: false, error: "invalid_icon" };

  return { ok: true, name: normalizedName, monthlyLimitCents, iconId };
}

export type CreateExpenseGroupError = ExpenseGroupInputError | "duplicate_group_name" | "unit_not_found";

export type CreateExpenseGroupResult = { ok: true; groupId: string } | { ok: false; error: CreateExpenseGroupError };

export async function createExpenseGroup(
  input: unknown,
  unitId: string | null | undefined,
  {
    insert,
    isNameTaken,
    iconExists,
  }: {
    insert: (data: ExpenseGroupData & { unitId: string }) => Promise<{ id: string }>;
    isNameTaken: IsNameTaken;
    iconExists: IconExists;
  },
): Promise<CreateExpenseGroupResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = parseExpenseGroupInput(input);
  if (!parsed.ok) return parsed;
  if (!(await iconExists(parsed.iconId))) return { ok: false, error: "invalid_icon" };
  if (await isNameTaken(unitId, parsed.name, null)) return { ok: false, error: "duplicate_group_name" };

  const { name, monthlyLimitCents, iconId } = parsed;
  const group = await insert({ name, monthlyLimitCents, iconId, unitId });
  return { ok: true, groupId: group.id };
}

export type UpdateExpenseGroupError = ExpenseGroupInputError | "duplicate_group_name" | "group_not_found";

export type UpdateExpenseGroupResult = { ok: true } | { ok: false; error: UpdateExpenseGroupError };

// update devolve false quando o grupo não existe (ou não é da unidade).
export async function updateExpenseGroup(
  input: unknown,
  unitId: string | null | undefined,
  groupId: string | null | undefined,
  {
    update,
    isNameTaken,
    iconExists,
  }: {
    update: (groupId: string, data: ExpenseGroupData) => Promise<boolean>;
    isNameTaken: IsNameTaken;
    iconExists: IconExists;
  },
): Promise<UpdateExpenseGroupResult> {
  if (!unitId || !groupId) return { ok: false, error: "group_not_found" };

  const parsed = parseExpenseGroupInput(input);
  if (!parsed.ok) return parsed;
  if (!(await iconExists(parsed.iconId))) return { ok: false, error: "invalid_icon" };
  if (await isNameTaken(unitId, parsed.name, groupId)) return { ok: false, error: "duplicate_group_name" };

  const { name, monthlyLimitCents, iconId } = parsed;
  const found = await update(groupId, { name, monthlyLimitCents, iconId });
  return found ? { ok: true } : { ok: false, error: "group_not_found" };
}

export type DeleteExpenseGroupResult = { ok: true } | { ok: false; error: "group_not_found" | "group_has_expenses" };

// Grupo com despesas não sai, para nenhuma despesa ficar sem grupo.
// remove devolve false quando o grupo não existe (ou não é da unidade).
export async function deleteExpenseGroup(
  groupId: string | null | undefined,
  {
    remove,
    hasExpenses,
  }: { remove: (groupId: string) => Promise<boolean>; hasExpenses: (groupId: string) => Promise<boolean> },
): Promise<DeleteExpenseGroupResult> {
  if (!groupId) return { ok: false, error: "group_not_found" };
  if (await hasExpenses(groupId)) return { ok: false, error: "group_has_expenses" };

  const found = await remove(groupId);
  return found ? { ok: true } : { ok: false, error: "group_not_found" };
}
