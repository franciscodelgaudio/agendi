import { parseDay } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list";
import {
  validOwner,
  type ExpenseOwner,
  type GroupLimitChange,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";
import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";

const MAX_NAME_LENGTH = 40;

export type ExpenseGroupInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_monthly_limit"
  | "invalid_limit_month"
  | "invalid_icon";

export type ExpenseGroupData = { name: string; iconId: string };

// Limite de gasto por mês a partir do mês ("AAAA-MM"); cents é null quando fica sem limite.
type ParsedGroupInput = ExpenseGroupData & { limit: GroupLimitChange };

// Confere se outro grupo do dono já usa o nome; excludeId é o próprio grupo na edição.
type IsNameTaken = (owner: ExpenseOwner, name: string, excludeId: string | null) => Promise<boolean>;

// Confere se o ícone está no catálogo.
type IconExists = (iconId: string) => Promise<boolean>;

// Valida e normaliza os campos como chegam do FormData; limite vazio vira null.
function parseExpenseGroupInput(input: unknown): ({ ok: true } & ParsedGroupInput) | { ok: false; error: ExpenseGroupInputError } {
  const { name, monthlyLimit, limitFrom, iconId } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  if (monthlyLimit != null && typeof monthlyLimit !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const limit = monthlyLimit?.trim();
  const monthlyLimitCents = limit ? parsePriceCents(limit) : null;
  if (limit && !monthlyLimitCents) return { ok: false, error: "invalid_monthly_limit" };
  if (typeof limitFrom !== "string" || !parseDay(`${limitFrom}-01`)) return { ok: false, error: "invalid_limit_month" };

  if (typeof iconId !== "string" || !iconId) return { ok: false, error: "invalid_icon" };

  return { ok: true, name: normalizedName, iconId, limit: { month: limitFrom, cents: monthlyLimitCents } };
}

export type CreateExpenseGroupError = ExpenseGroupInputError | "duplicate_group_name" | "owner_not_found";

export type CreateExpenseGroupResult = { ok: true; groupId: string } | { ok: false; error: CreateExpenseGroupError };

export async function createExpenseGroup(
  input: unknown,
  ownerInput: ExpenseOwner | null | undefined,
  {
    insert,
    isNameTaken,
    iconExists,
  }: {
    insert: (
      data: ExpenseGroupData & ExpenseOwner & { monthlyLimitCents: null; limitChanges: GroupLimitChange[] },
    ) => Promise<{ id: string }>;
    isNameTaken: IsNameTaken;
    iconExists: IconExists;
  },
): Promise<CreateExpenseGroupResult> {
  const owner = validOwner(ownerInput);
  if (!owner) return { ok: false, error: "owner_not_found" };

  const parsed = parseExpenseGroupInput(input);
  if (!parsed.ok) return parsed;
  if (!(await iconExists(parsed.iconId))) return { ok: false, error: "invalid_icon" };
  if (await isNameTaken(owner, parsed.name, null)) return { ok: false, error: "duplicate_group_name" };

  // Antes do mês escolhido, o grupo fica sem limite.
  const { name, iconId, limit } = parsed;
  const limitChanges = limit.cents === null ? [] : [limit];
  const group = await insert({ name, monthlyLimitCents: null, limitChanges, iconId, ...owner });
  return { ok: true, groupId: group.id };
}

export type UpdateExpenseGroupError = ExpenseGroupInputError | "duplicate_group_name" | "group_not_found";

export type UpdateExpenseGroupResult = { ok: true } | { ok: false; error: UpdateExpenseGroupError };

// update grava nome e ícone e aplica a mudança de limite; devolve false quando o grupo não
// existe (ou não é do dono).
export async function updateExpenseGroup(
  input: unknown,
  ownerInput: ExpenseOwner | null | undefined,
  groupId: string | null | undefined,
  {
    update,
    isNameTaken,
    iconExists,
  }: {
    update: (groupId: string, data: ExpenseGroupData, limit: GroupLimitChange) => Promise<boolean>;
    isNameTaken: IsNameTaken;
    iconExists: IconExists;
  },
): Promise<UpdateExpenseGroupResult> {
  const owner = validOwner(ownerInput);
  if (!owner || !groupId) return { ok: false, error: "group_not_found" };

  const parsed = parseExpenseGroupInput(input);
  if (!parsed.ok) return parsed;
  if (!(await iconExists(parsed.iconId))) return { ok: false, error: "invalid_icon" };
  if (await isNameTaken(owner, parsed.name, groupId)) return { ok: false, error: "duplicate_group_name" };

  const { name, iconId, limit } = parsed;
  const found = await update(groupId, { name, iconId }, limit);
  return found ? { ok: true } : { ok: false, error: "group_not_found" };
}

export type UpdateGroupMonthLimitResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "invalid_monthly_limit" | "invalid_limit_month" | "group_not_found" };

// Limite de um mês só ("AAAA-MM"), editado na tabela mês a mês; limite vazio deixa o mês sem
// limite. setMonthLimit devolve false quando o grupo não existe (ou não é do dono).
export async function updateGroupMonthLimit(
  input: unknown,
  owner: ExpenseOwner | null | undefined,
  groupId: string | null | undefined,
  { setMonthLimit }: { setMonthLimit: (groupId: string, month: string, cents: number | null) => Promise<boolean> },
): Promise<UpdateGroupMonthLimitResult> {
  if (!validOwner(owner) || !groupId) return { ok: false, error: "group_not_found" };

  const { month, limit } = (input ?? {}) as Record<string, unknown>;
  if (limit != null && typeof limit !== "string") return { ok: false, error: "invalid_input" };
  const trimmed = limit?.trim();
  const cents = trimmed ? parsePriceCents(trimmed) : null;
  if (trimmed && !cents) return { ok: false, error: "invalid_monthly_limit" };
  if (typeof month !== "string" || !parseDay(`${month}-01`)) return { ok: false, error: "invalid_limit_month" };

  const found = await setMonthLimit(groupId, month, cents);
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
