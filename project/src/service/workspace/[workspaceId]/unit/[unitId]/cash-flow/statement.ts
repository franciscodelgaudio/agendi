import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { appliedShareBps, type PartnerTier, type ThresholdRule } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner";

const MAX_NAME_LENGTH = 80;
const FULL_BPS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONGO_DUPLICATE_KEY = 11000;
const CLOSE_PERIODS = ["until", "range"] as const;

export function passOnCents(grossCents: number, passOnBps: number) {
  return Math.round((grossCents * passOnBps) / FULL_BPS);
}

export function netCents(grossCents: number, passOnBps: number) {
  return grossCents - passOnCents(grossCents, passOnBps);
}

export type ClosePeriod = { unitId: string | null; period: (typeof CLOSE_PERIODS)[number]; from: string; to: string };

type PendingDayTotal = { unitId: string | null; day: string; count: number; cents: number };

function daysInPeriod<Day extends PendingDayTotal>(days: Day[], filter: ClosePeriod) {
  if (!parseDay(filter.to)) return [];
  const from = filter.period === "range" ? filter.from : "";
  if (filter.period === "range" && (!parseDay(from) || from > filter.to)) return [];
  return days.filter((day) => (!filter.unitId || day.unitId === filter.unitId) && day.day >= from && day.day <= filter.to);
}

function sumDays(days: PendingDayTotal[]) {
  return days.reduce((sum, day) => ({ count: sum.count + day.count, cents: sum.cents + day.cents }), { count: 0, cents: 0 });
}

export function pendingInPeriod(days: PendingDayTotal[], filter: ClosePeriod) {
  return sumDays(daysInPeriod(days, filter));
}

export function closedPeriodOverlaps(
  days: PendingDayTotal[],
  filter: ClosePeriod,
  statements: { name: string; from: string | null; to: string }[],
) {
  const selected = daysInPeriod(days, filter);
  return statements
    .map((statement) => ({
      name: statement.name,
      ...sumDays(selected.filter((day) => day.day >= (statement.from ?? "") && day.day <= statement.to)),
    }))
    .filter((overlap) => overlap.count > 0);
}

function isoDay(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function suggestedPeriod(lastTo: string | null, today: string) {
  const [year, month] = parseDay(today)!;
  const lastMonthEnd = isoDay(year, month - 1, 0);
  const [lastYear, lastMonth, lastDay] = lastTo ? parseDay(lastTo)! : [year, month - 1, 0];
  const from = isoDay(lastYear, lastMonth - 1, lastDay + 1);
  return { from, to: from > lastMonthEnd ? today : lastMonthEnd };
}

function dayStart(value: string) {
  const [year, month, day] = parseDay(value)!;
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS));
}

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

const closeSchema = z
  .object(
    {
      name: z
        .string({ error: "invalid_input" })
        .trim()
        .min(1, { error: "invalid_name" })
        .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
      paidAt: optionalPaidAtField,
      period: z.enum(CLOSE_PERIODS, { error: "invalid_period" }),
      from: z.string({ error: "invalid_period_start" }).trim().nullish(),
      to: z
        .string({ error: "invalid_period_end" })
        .trim()
        .refine((value) => parseDay(value) !== null, { error: "invalid_period_end" }),
    },
    { error: "invalid_input" },
  )
  .superRefine((data, ctx) => {
    if (data.period !== "range") return;
    if (!data.from || parseDay(data.from) === null) ctx.addIssue({ code: "custom", message: "invalid_period_start" });
    else if (data.from > data.to) ctx.addIssue({ code: "custom", message: "period_reversed" });
  });

const settleSchema = z.object({ paidAt: requiredPaidAtField }, { error: "invalid_input" });

const paySchema = z.object({ paidAt: requiredPaidAtField }, { error: "invalid_input" });

export type StatementData = {
  name: string;
  from: Date | null;
  to: Date;
  grossCents: number;
  shareBps: number;
  partnerId: string;
  walletId: string;
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

export type ReceivableTransaction = StatementTransaction & { receivableId: string };

type SaveStatement = (data: { statement: StatementData; transaction: StatementTransaction | null }) => Promise<{ id: string }>;

function statementTransaction(
  source: { name: string; shareBps: number; walletId: string; unitId: string | null; workspaceId: string },
  grossCents: number,
  paidAt: Date,
): StatementTransaction {
  return {
    name: source.name,
    totalCents: netCents(grossCents, source.shareBps),
    type: "incoming",
    paidAt,
    walletId: source.walletId,
    unitId: source.unitId,
    workspaceId: source.workspaceId,
  };
}

async function unlessSettled(save: () => Promise<{ id: string }>) {
  try {
    return { ok: true as const, id: (await save()).id };
  } catch (e) {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) return { ok: false as const, error: "receivable_settled" as const };
    throw e;
  }
}

type StatementInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_paid_at"
  | "invalid_period"
  | "invalid_period_start"
  | "invalid_period_end"
  | "period_reversed";

export type CloseStatementError =
  | AccessError
  | StatementInputError
  | "partner_not_found"
  | "partner_without_unit"
  | "unit_without_wallet"
  | "no_pending_receivables"
  | "receivable_settled";

export type CloseStatementResult = { ok: true; statementId: string } | { ok: false; error: CloseStatementError };

export type PartnerToClose = {
  thresholdRule: ThresholdRule;
  tiers: PartnerTier[];
  unit: { id: string; walletId: string | null } | null;
};

export type PendingFilter = { walletId: string; unitId: string; from: Date | null; before: Date };

export async function closeStatement(
  input: unknown,
  partnerId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    findPartner: (partnerId: string) => Promise<PartnerToClose | null>;
    findPending: (filter: PendingFilter) => Promise<{ id: string; valueCents: number }[]>;
    save: SaveStatement;
  },
): Promise<CloseStatementResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<StatementInputError>(parsed.error) };
  if (!partnerId) return { ok: false, error: "partner_not_found" };

  const partner = await deps.findPartner(partnerId);
  if (!partner) return { ok: false, error: "partner_not_found" };
  if (!partner.unit) return { ok: false, error: "partner_without_unit" };
  const { id: unitId, walletId } = partner.unit;
  if (!walletId) return { ok: false, error: "unit_without_wallet" };

  const { name, paidAt, period } = parsed.data;
  const from = period === "range" && parsed.data.from ? dayStart(parsed.data.from) : null;
  const to = dayStart(parsed.data.to);
  const pending = await deps.findPending({ walletId, unitId, from, before: new Date(to.getTime() + DAY_MS) });
  if (pending.length === 0) return { ok: false, error: "no_pending_receivables" };

  const grossCents = pending.reduce((sum, receivable) => sum + receivable.valueCents, 0);
  const statement: StatementData = {
    name,
    from,
    to,
    grossCents,
    shareBps: appliedShareBps(partner, grossCents),
    partnerId,
    walletId,
    workspaceId: ctx.workspaceId,
    receivableIds: pending.map((receivable) => receivable.id),
  };
  const transaction = paidAt ? statementTransaction({ ...statement, unitId }, grossCents, paidAt) : null;

  const saved = await unlessSettled(() => deps.save({ statement, transaction }));
  if (!saved.ok) return saved;
  return { ok: true, statementId: saved.id };
}

export type SettleReceivableError =
  | AccessError
  | "invalid_input"
  | "invalid_paid_at"
  | "receivable_not_found"
  | "receivable_has_partner"
  | "receivable_settled";

export type SettleReceivableResult = { ok: true; transactionId: string } | { ok: false; error: SettleReceivableError };

export async function settleReceivable(
  input: unknown,
  receivableId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    findPendingReceivable: (receivableId: string) => Promise<{
      id: string;
      name: string;
      valueCents: number;
      walletId: string;
      unitId: string | null;
      unitHasPartner: boolean;
    } | null>;
    save: (transaction: ReceivableTransaction) => Promise<{ id: string }>;
  },
): Promise<SettleReceivableResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<"invalid_input" | "invalid_paid_at">(parsed.error) };
  if (!receivableId) return { ok: false, error: "receivable_not_found" };

  const receivable = await deps.findPendingReceivable(receivableId);
  if (!receivable) return { ok: false, error: "receivable_not_found" };
  if (receivable.unitHasPartner) return { ok: false, error: "receivable_has_partner" };

  const saved = await unlessSettled(() =>
    deps.save({
      name: receivable.name,
      totalCents: receivable.valueCents,
      type: "incoming",
      paidAt: parsed.data.paidAt,
      walletId: receivable.walletId,
      unitId: receivable.unitId,
      workspaceId: ctx.workspaceId,
      receivableId: receivable.id,
    }),
  );
  if (!saved.ok) return saved;
  return { ok: true, transactionId: saved.id };
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
      shareBps: number;
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

export type UnpayStatementError = AccessError | "statement_not_found" | "statement_not_paid";

export async function unpayStatement(
  statementId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findStatement: (statementId: string) => Promise<{ paid: boolean } | null>;
    unpay: (statementId: string) => Promise<boolean>;
  },
): Promise<StatementResult<UnpayStatementError>> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!statementId) return { ok: false, error: "statement_not_found" };

  const statement = await deps.findStatement(statementId);
  if (!statement) return { ok: false, error: "statement_not_found" };
  if (!statement.paid) return { ok: false, error: "statement_not_paid" };

  if (!(await deps.unpay(statementId))) return { ok: false, error: "statement_not_found" };
  return { ok: true };
}
