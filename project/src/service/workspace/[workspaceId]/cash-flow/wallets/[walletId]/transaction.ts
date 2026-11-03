import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseMoneyCents } from "@/service/_shared/money";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const TRANSACTION_TYPES = ["expense", "incoming"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

const MAX_NAME_LENGTH = 80;

function dayStart(value: string) {
  const [year, month, day] = parseDay(value)!;
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
}

const transactionSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    total: z
      .string({ error: "invalid_input" })
      .transform((value) => parseMoneyCents(value) ?? 0)
      .refine((cents) => cents > 0, { error: "invalid_total" }),
    type: z.enum(TRANSACTION_TYPES, { error: "invalid_type" }),
    paidAt: z
      .string({ error: "invalid_paid_at" })
      .trim()
      .refine((value) => parseDay(value) !== null, { error: "invalid_paid_at" })
      .transform(dayStart),
  },
  { error: "invalid_input" },
);

const unitIdField = z
  .string({ error: "invalid_input" })
  .trim()
  .nullish()
  .transform((value) => value || null);

export type TransactionInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_total"
  | "invalid_type"
  | "invalid_paid_at";

export type TransactionData = { name: string; totalCents: number; type: TransactionType; paidAt: Date };

function parseTransaction(input: unknown): { ok: true; data: TransactionData } | { ok: false; error: TransactionInputError } {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<TransactionInputError>(parsed.error) };
  const { name, total, type, paidAt } = parsed.data;
  return { ok: true, data: { name, totalCents: total, type, paidAt } };
}

export type CreateTransactionError =
  | AccessError
  | TransactionInputError
  | "wallet_not_found"
  | "unit_not_found"
  | "unit_not_in_wallet";

export type CreateTransactionResult = { ok: true; transactionId: string } | { ok: false; error: CreateTransactionError };

export async function createTransaction(
  input: unknown,
  walletId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    walletExists: (walletId: string) => Promise<boolean>;
    findUnit: (unitId: string) => Promise<{ walletId: string | null } | null>;
    insert: (data: TransactionData & { walletId: string; unitId: string | null; workspaceId: string }) => Promise<{ id: string }>;
  },
): Promise<CreateTransactionResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseTransaction(input);
  if (!parsed.ok) return parsed;
  const unitId = unitIdField.safeParse((input as Record<string, unknown>).unitId);
  if (!unitId.success) return { ok: false, error: "invalid_input" };
  if (!walletId || !(await deps.walletExists(walletId))) return { ok: false, error: "wallet_not_found" };

  if (unitId.data) {
    const unit = await deps.findUnit(unitId.data);
    if (!unit) return { ok: false, error: "unit_not_found" };
    if (unit.walletId !== walletId) return { ok: false, error: "unit_not_in_wallet" };
  }

  const transaction = await deps.insert({ ...parsed.data, walletId, unitId: unitId.data, workspaceId: ctx.workspaceId });
  return { ok: true, transactionId: transaction.id };
}

export type CreateUnitTransactionError = AccessError | TransactionInputError | "unit_not_found" | "unit_without_wallet";

export type CreateUnitTransactionResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: CreateUnitTransactionError };

export async function createUnitTransaction(
  input: unknown,
  unitId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    findUnit: (unitId: string) => Promise<{ walletId: string | null } | null>;
    insert: (data: TransactionData & { walletId: string; unitId: string; workspaceId: string }) => Promise<{ id: string }>;
  },
): Promise<CreateUnitTransactionResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseTransaction(input);
  if (!parsed.ok) return parsed;
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const unit = await deps.findUnit(unitId);
  if (!unit) return { ok: false, error: "unit_not_found" };
  if (!unit.walletId) return { ok: false, error: "unit_without_wallet" };

  const transaction = await deps.insert({ ...parsed.data, walletId: unit.walletId, unitId, workspaceId: ctx.workspaceId });
  return { ok: true, transactionId: transaction.id };
}

type FoundTransaction = { fromStatement: boolean };

export type UpdateTransactionError =
  | AccessError
  | TransactionInputError
  | "transaction_not_found"
  | "transaction_from_statement";

export type UpdateTransactionResult = { ok: true } | { ok: false; error: UpdateTransactionError };

export async function updateTransaction(
  input: unknown,
  transactionId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findTransaction: (transactionId: string) => Promise<FoundTransaction | null>;
    update: (transactionId: string, data: TransactionData) => Promise<boolean>;
  },
): Promise<UpdateTransactionResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!transactionId) return { ok: false, error: "transaction_not_found" };

  const parsed = parseTransaction(input);
  if (!parsed.ok) return parsed;

  const found = await deps.findTransaction(transactionId);
  if (!found) return { ok: false, error: "transaction_not_found" };
  if (found.fromStatement) return { ok: false, error: "transaction_from_statement" };

  if (!(await deps.update(transactionId, parsed.data))) return { ok: false, error: "transaction_not_found" };
  return { ok: true };
}

export type DeleteTransactionError = AccessError | "transaction_not_found" | "transaction_from_statement";

export type DeleteTransactionResult = { ok: true } | { ok: false; error: DeleteTransactionError };

export async function deleteTransaction(
  transactionId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findTransaction: (transactionId: string) => Promise<FoundTransaction | null>;
    remove: (transactionId: string) => Promise<boolean>;
  },
): Promise<DeleteTransactionResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!transactionId) return { ok: false, error: "transaction_not_found" };

  const found = await deps.findTransaction(transactionId);
  if (!found) return { ok: false, error: "transaction_not_found" };
  if (found.fromStatement) return { ok: false, error: "transaction_from_statement" };

  if (!(await deps.remove(transactionId))) return { ok: false, error: "transaction_not_found" };
  return { ok: true };
}
