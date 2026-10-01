import { parseDay } from "@/service/_shared/timezone";
import type { DayTotal } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";
import type { CommissionBase } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member";

// Folha da unidade: cada mês de trabalho ("2026-09") é pago no dia de pagamento do mês
// seguinte, com salário e bônus proporcionais a partir da data de início mais a comissão
// do mês. O lembrete aparece alguns dias antes do vencimento e fica enquanto não for pago.

export const PAYROLL_REMINDER_DAYS = 5;

export type PayrollMember = {
  memberId: string;
  userId: string | null;
  // Do vínculo, ou da função em vínculos antigos sem base guardada.
  commissionBase: CommissionBase;
  // "2026-02-15"
  startDate: string | null;
  // 1 a 31; null sem dia de pagamento definido.
  payDay: number | null;
  commissionPercent: number | null;
  salaryCents: number | null;
  bonuses: { amountCents: number }[];
};
export type PayrollAmount = { salaryCents: number; commissionCents: number };
export type PayrollReminder = PayrollAmount & { memberId: string; month: string; dueDate: string; overdue: boolean };

// Date.UTC normaliza estouros: dia 0 é o último dia do mês anterior, mês 13 é janeiro seguinte.
function utcDay(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// "2026-09" -> [2026, 9]; null se o formato for outro.
function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 ? ([year, month] as const) : null;
}

function shiftMonth(value: string, months: number) {
  const [year, month] = parseMonth(value)!;
  return utcDay(year, month + months, 1).slice(0, 7);
}

// Dia de pagamento no mês seguinte; se o mês não tem esse dia, o último.
export function payrollDueDate(month: string, payDay: number) {
  const [year, next] = parseMonth(shiftMonth(month, 1))!;
  return utcDay(year, next, Math.min(payDay, daysInMonth(year, next)));
}

// Próximo vencimento a partir de hoje (inclusive), sem contar meses antes da data de início.
export function nextPayrollDate({ startDate, payDay }: Pick<PayrollMember, "startDate" | "payDay">, today: string) {
  if (payDay === null) return null;
  let month = shiftMonth(today.slice(0, 7), -1);
  if (payrollDueDate(month, payDay) < today) month = shiftMonth(month, 1);
  if (startDate && startDate.slice(0, 7) > month) month = startDate.slice(0, 7);
  return payrollDueDate(month, payDay);
}

// Comissão sobre os próprios serviços ou sobre o bruto, conforme a base.
export function payrollAmount(member: PayrollMember, month: string, appointments: DayTotal[]): PayrollAmount {
  const [year, monthNumber] = parseMonth(month)!;
  const days = daysInMonth(year, monthNumber);
  const first = `${month}-01`;
  const last = `${month}-${String(days).padStart(2, "0")}`;

  const monthlyCents = member.bonuses.reduce((sum, bonus) => sum + bonus.amountCents, member.salaryCents ?? 0);
  const { startDate } = member;
  const startDay = !startDate || startDate <= first ? 1 : startDate > last ? days + 1 : Number(startDate.slice(8));
  const salaryCents = Math.round((monthlyCents * (days - startDay + 1)) / days);

  let baseCents = 0;
  const gross = member.commissionBase === "gross";
  if (member.commissionPercent !== null && (gross || member.userId)) {
    for (const { date, therapistId, cents } of appointments) {
      if (date < first || date > last) continue;
      if (gross || therapistId === member.userId) baseCents += cents;
    }
  }
  const commissionCents = Math.round((baseCents * (member.commissionPercent ?? 0)) / 100);
  return { salaryCents, commissionCents };
}

// Meses sem pagamento que vencem até PAYROLL_REMINDER_DAYS dias depois de hoje. Com data de
// início, desde o mês dela; sem, só o último mês vencido ou a vencer. Ordena pelo vencimento.
export function payrollReminders(
  members: PayrollMember[],
  payments: { memberId: string; month: string }[],
  appointments: DayTotal[],
  today: string,
): PayrollReminder[] {
  const [year, month, day] = parseDay(today)!;
  const limit = utcDay(year, month, day + PAYROLL_REMINDER_DAYS);
  const paid = new Set(payments.map((payment) => `${payment.memberId}:${payment.month}`));

  const reminders: PayrollReminder[] = [];
  for (const member of members) {
    if (member.payDay === null) continue;
    let latest = today.slice(0, 7);
    while (payrollDueDate(latest, member.payDay) > limit) latest = shiftMonth(latest, -1);

    for (let current = member.startDate?.slice(0, 7) ?? latest; current <= latest; current = shiftMonth(current, 1)) {
      if (paid.has(`${member.memberId}:${current}`)) continue;
      const amount = payrollAmount(member, current, appointments);
      if (!amount.salaryCents && !amount.commissionCents) continue;
      const dueDate = payrollDueDate(current, member.payDay);
      reminders.push({ memberId: member.memberId, month: current, dueDate, overdue: dueDate < today, ...amount });
    }
  }
  return reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export type PayrollPaymentError =
  | "workspace_not_found"
  | "forbidden"
  | "member_not_found"
  | "invalid_input"
  | "invalid_month"
  | "invalid_date"
  | "invalid_amount";

export type PayrollPaymentResult = { ok: true } | { ok: false; error: PayrollPaymentError };
export type PayrollPayment = PayrollAmount & { month: string; paidOn: string };

type FindMember = (memberId: string) => Promise<{ id: string } | null>;

// Mesma permissão da remuneração: gerenciar a equipe.
async function checkAccess(
  memberId: string | null | undefined,
  { actor }: { actor: Actor | null },
  findMember: FindMember,
  validate: () => PayrollPaymentError | null,
): Promise<PayrollPaymentError | null> {
  if (!actor) return "workspace_not_found";
  if (!can(actor, "team.manage")) return "forbidden";
  if (!memberId) return "member_not_found";
  const invalid = validate();
  if (invalid) return invalid;
  const member = await findMember(memberId);
  if (!member) return "member_not_found";
  return null;
}

// Vazio vale zero; undefined quando inválido.
function parseAmount(value: unknown) {
  if (value == null || (typeof value === "string" && !value.trim())) return 0;
  if (typeof value !== "string") return undefined;
  return parsePriceCents(value.trim()) ?? undefined;
}

export async function recordPayrollPayment(
  input: unknown,
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { findMember: FindMember; save: (memberId: string, payment: PayrollPayment) => Promise<void> },
): Promise<PayrollPaymentResult> {
  const { month, paidOn, salary, commission } = (input ?? {}) as Record<string, unknown>;
  const salaryCents = parseAmount(salary);
  const commissionCents = parseAmount(commission);

  const error = await checkAccess(memberId, ctx, deps.findMember, () => {
    if (input == null || typeof input !== "object") return "invalid_input";
    if (typeof month !== "string" || !parseMonth(month)) return "invalid_month";
    if (typeof paidOn !== "string" || !parseDay(paidOn)) return "invalid_date";
    if (salaryCents === undefined || commissionCents === undefined) return "invalid_amount";
    if (!salaryCents && !commissionCents) return "invalid_amount";
    return null;
  });
  if (error) return { ok: false, error };

  await deps.save(memberId!, {
    month: month as string,
    paidOn: paidOn as string,
    salaryCents: salaryCents!,
    commissionCents: commissionCents!,
  });
  return { ok: true };
}

export async function removePayrollPayment(
  month: string,
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { findMember: FindMember; remove: (memberId: string, month: string) => Promise<void> },
): Promise<PayrollPaymentResult> {
  const error = await checkAccess(memberId, ctx, deps.findMember, () => (parseMonth(month) ? null : "invalid_month"));
  if (error) return { ok: false, error };

  await deps.remove(memberId!, month);
  return { ok: true };
}
