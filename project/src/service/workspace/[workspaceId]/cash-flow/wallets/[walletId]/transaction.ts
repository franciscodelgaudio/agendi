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
      .string({ error: "invalid_input" })
      .trim()
      .nullish()
      .transform((value) => value || null)
      .refine((value) => value === null || parseDay(value) !== null, { error: "invalid_paid_at" })
      .transform((value) => (value ? dayStart(value) : null)),
  },
  { error: "invalid_input" },
);

export type TransactionInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_total"
  | "invalid_type"
  | "invalid_paid_at";

export type TransactionData = { name: string; totalCents: number; type: TransactionType; paidAt: Date | null };

function parseTransaction(input: unknown): { ok: true; data: TransactionData } | { ok: false; error: TransactionInputError } {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<TransactionInputError>(parsed.error) };
  const { name, total, type, paidAt } = parsed.data;
  return { ok: true, data: { name, totalCents: total, type, paidAt } };
}

export type CreateTransactionError = AccessError | TransactionInputError | "wallet_not_found";

export type CreateTransactionResult = { ok: true; transactionId: string } | { ok: false; error: CreateTransactionError };

export async function createTransaction(
  input: unknown,
  walletId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    walletExists: (walletId: string) => Promise<boolean>;
    insert: (data: TransactionData & { walletId: string; workspaceId: string }) => Promise<{ id: string }>;
  },
): Promise<CreateTransactionResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseTransaction(input);
  if (!parsed.ok) return parsed;
  if (!walletId || !(await deps.walletExists(walletId))) return { ok: false, error: "wallet_not_found" };

  const transaction = await deps.insert({ ...parsed.data, walletId, workspaceId: ctx.workspaceId });
  return { ok: true, transactionId: transaction.id };
}

type FoundTransaction = { fromAppointment: boolean };

export type UpdateTransactionError =
  | AccessError
  | TransactionInputError
  | "transaction_not_found"
  | "transaction_from_appointment";

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
  if (found.fromAppointment) return { ok: false, error: "transaction_from_appointment" };

  if (!(await deps.update(transactionId, parsed.data))) return { ok: false, error: "transaction_not_found" };
  return { ok: true };
}

export type DeleteTransactionError = AccessError | "transaction_not_found" | "transaction_from_appointment";

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
  if (found.fromAppointment) return { ok: false, error: "transaction_from_appointment" };

  if (!(await deps.remove(transactionId))) return { ok: false, error: "transaction_not_found" };
  return { ok: true };
}

export function appointmentTransaction(appointment: {
  guest: { name: string };
  items: { priceCents: number }[];
  performedAt: Date;
}): { name: string; totalCents: number; type: "incoming"; paidAt: Date } | null {
  const totalCents = appointment.items.reduce((sum, item) => sum + item.priceCents, 0);
  if (totalCents <= 0) return null;
  return { name: `Atendimento · ${appointment.guest.name}`, totalCents, type: "incoming", paidAt: appointment.performedAt };
}
