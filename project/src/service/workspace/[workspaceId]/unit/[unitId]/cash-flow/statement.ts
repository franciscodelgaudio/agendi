import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 80;
const FULL_BPS = 10_000;
const MONGO_DUPLICATE_KEY = 11000;

export function parsePassOnBps(value: string) {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bps > 0 && bps <= FULL_BPS ? bps : null;
}

export function passOnCents(grossCents: number, passOnBps: number) {
  return Math.round((grossCents * passOnBps) / FULL_BPS);
}

function dayStart(value: string) {
  const [year, month, day] = parseDay(value)!;
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
}

const passOnField = z
  .string({ error: "invalid_pass_on" })
  .transform((value) => parsePassOnBps(value) ?? 0)
  .refine((bps) => bps > 0, { error: "invalid_pass_on" });

const requiredPaidAtField = z
  .string({ error: "invalid_paid_at" })
  .trim()
  .refine((value) => parseDay(value) !== null, { error: "invalid_paid_at" })
  .transform(dayStart);

const optionalPaidAtField = z
  .string({ error: "invalid_input" })
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || parseDay(value) !== null, { error: "invalid_paid_at" })
  .transform((value) => (value ? dayStart(value) : null));

const closeSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    passOn: passOnField,
    paidAt: optionalPaidAtField,
  },
  { error: "invalid_input" },
);

const settleSchema = z.object({ passOn: passOnField, paidAt: requiredPaidAtField }, { error: "invalid_input" });

const paySchema = z.object({ paidAt: requiredPaidAtField }, { error: "invalid_input" });

export type StatementData = {
  name: string;
  closedAt: Date;
  passOnBps: number;
  walletId: string;
  unitId: string | null;
  workspaceId: string;
  receivableIds: string[];
};

export type StatementTransaction = {
  name: string;
  totalCents: number;
  type: "incoming";
  paidAt: Date;
  walletId: string;
  unitId: string | null;
  workspaceId: string;
};

type SaveStatement = (data: { statement: StatementData; transaction: StatementTransaction | null }) => Promise<{ id: string }>;

function statementTransaction(
  statement: Pick<StatementData, "name" | "passOnBps" | "walletId" | "unitId" | "workspaceId">,
  grossCents: number,
  paidAt: Date,
): StatementTransaction {
  return {
    name: statement.name,
    totalCents: passOnCents(grossCents, statement.passOnBps),
    type: "incoming",
    paidAt,
    walletId: statement.walletId,
    unitId: statement.unitId,
    workspaceId: statement.workspaceId,
  };
}

async function saveStatement(
  save: SaveStatement,
  data: Parameters<SaveStatement>[0],
): Promise<{ ok: true; statementId: string } | { ok: false; error: "receivable_settled" }> {
  try {
    const statement = await save(data);
    return { ok: true, statementId: statement.id };
  } catch (e) {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) return { ok: false, error: "receivable_settled" };
    throw e;
  }
}

type StatementInputError = "invalid_input" | "invalid_name" | "name_too_long" | "invalid_pass_on" | "invalid_paid_at";

type StatementCtx = { workspaceId: string; actor: Actor | null; now: Date };

export type CloseStatementError =
  | AccessError
  | StatementInputError
  | "unit_not_found"
  | "unit_without_wallet"
  | "no_pending_receivables"
  | "receivable_settled";

export type CloseStatementResult = { ok: true; statementId: string } | { ok: false; error: CloseStatementError };

export async function closeStatement(
  input: unknown,
  unitId: string | null | undefined,
  ctx: StatementCtx,
  deps: {
    findUnit: (unitId: string) => Promise<{ walletId: string | null } | null>;
    findPending: (filter: { walletId: string; unitId: string }) => Promise<{ id: string; valueCents: number }[]>;
    save: SaveStatement;
  },
): Promise<CloseStatementResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<StatementInputError>(parsed.error) };
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const unit = await deps.findUnit(unitId);
  if (!unit) return { ok: false, error: "unit_not_found" };
  if (!unit.walletId) return { ok: false, error: "unit_without_wallet" };

  const pending = await deps.findPending({ walletId: unit.walletId, unitId });
  if (pending.length === 0) return { ok: false, error: "no_pending_receivables" };

  const { name, passOn, paidAt } = parsed.data;
  const statement: StatementData = {
    name,
    closedAt: ctx.now,
    passOnBps: passOn,
    walletId: unit.walletId,
    unitId,
    workspaceId: ctx.workspaceId,
    receivableIds: pending.map((receivable) => receivable.id),
  };
  const grossCents = pending.reduce((sum, receivable) => sum + receivable.valueCents, 0);
  return saveStatement(deps.save, {
    statement,
    transaction: paidAt ? statementTransaction(statement, grossCents, paidAt) : null,
  });
}

export type SettleReceivableError = AccessError | StatementInputError | "receivable_not_found" | "receivable_settled";

export type SettleReceivableResult = { ok: true; statementId: string } | { ok: false; error: SettleReceivableError };

export async function settleReceivable(
  input: unknown,
  receivableId: string | null | undefined,
  ctx: StatementCtx,
  deps: {
    findPendingReceivable: (receivableId: string) => Promise<{
      id: string;
      name: string;
      valueCents: number;
      walletId: string;
      unitId: string | null;
    } | null>;
    save: SaveStatement;
  },
): Promise<SettleReceivableResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<StatementInputError>(parsed.error) };
  if (!receivableId) return { ok: false, error: "receivable_not_found" };

  const receivable = await deps.findPendingReceivable(receivableId);
  if (!receivable) return { ok: false, error: "receivable_not_found" };

  const statement: StatementData = {
    name: receivable.name,
    closedAt: ctx.now,
    passOnBps: parsed.data.passOn,
    walletId: receivable.walletId,
    unitId: receivable.unitId,
    workspaceId: ctx.workspaceId,
    receivableIds: [receivable.id],
  };
  return saveStatement(deps.save, {
    statement,
    transaction: statementTransaction(statement, receivable.valueCents, parsed.data.paidAt),
  });
}

export type PayStatementError = AccessError | "invalid_input" | "invalid_paid_at" | "statement_not_found" | "statement_paid";

export type StatementResult<E extends string> = { ok: true } | { ok: false; error: E };

export async function payStatement(
  input: unknown,
  statementId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findStatement: (statementId: string) => Promise<{
      name: string;
      walletId: string;
      unitId: string | null;
      workspaceId: string;
      passOnBps: number;
      grossCents: number;
      paid: boolean;
    } | null>;
    pay: (statementId: string, transaction: StatementTransaction) => Promise<boolean>;
  },
): Promise<StatementResult<PayStatementError>> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!statementId) return { ok: false, error: "statement_not_found" };

  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<"invalid_input" | "invalid_paid_at">(parsed.error) };

  const statement = await deps.findStatement(statementId);
  if (!statement) return { ok: false, error: "statement_not_found" };
  if (statement.paid) return { ok: false, error: "statement_paid" };

  const transaction = statementTransaction(statement, statement.grossCents, parsed.data.paidAt);
  if (!(await deps.pay(statementId, transaction))) return { ok: false, error: "statement_not_found" };
  return { ok: true };
}

export type DeleteStatementError = AccessError | "statement_not_found" | "statement_paid";

export async function deleteStatement(
  statementId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findStatement: (statementId: string) => Promise<{ paid: boolean } | null>;
    remove: (statementId: string) => Promise<boolean>;
  },
): Promise<StatementResult<DeleteStatementError>> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!statementId) return { ok: false, error: "statement_not_found" };

  const statement = await deps.findStatement(statementId);
  if (!statement) return { ok: false, error: "statement_not_found" };
  if (statement.paid) return { ok: false, error: "statement_paid" };

  if (!(await deps.remove(statementId))) return { ok: false, error: "statement_not_found" };
  return { ok: true };
}
