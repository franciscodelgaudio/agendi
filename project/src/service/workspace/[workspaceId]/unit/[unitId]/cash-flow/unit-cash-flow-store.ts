import { Types } from "mongoose";
import {
  applyExpenses,
  applyPayrollPayments,
  applyStaffCosts,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  parseCashFlowQuery,
  staffPayByMember,
  summarizeCashFlow,
  teamPayRates,
  type DayRange,
  type DayTotal,
  type MemberStaffPay,
  type PayrollAdjustment,
  type TeamPayMember,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";
import {
  dailyExpenseTotalsPipeline,
  expenseGroupTotalsPipeline,
  type ExpenseDayTotal,
  type ExpenseGroupTotal,
  type GroupLimits,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { memberAttendsStages } from "@/service/workspace/[workspaceId]/team/unit-team";
import { Appointment } from "@/models/Appointment";
import { Expense } from "@/models/Expense";
import { ExpenseGroup } from "@/models/ExpenseGroup";
import { PayrollPayment } from "@/models/PayrollPayment";
import { WorkspaceMember } from "@/models/WorkspaceMember";

// Limites por mês do grupo como vêm do banco.
export function groupLimitsOf(group: {
  monthlyLimitCents?: number | null;
  limitChanges?: { month: string; cents?: number | null }[];
}): GroupLimits {
  return {
    monthlyLimitCents: group.monthlyLimitCents ?? null,
    limitChanges: (group.limitChanges ?? []).map(({ month, cents }) => ({ month, cents: cents ?? null })),
  };
}

export type TeamPayRow = TeamPayMember & { memberId: Types.ObjectId; name: string };

// Remuneração da equipe (administradores inclusive), só a vinculada à unidade quando ela vem.
export function findTeamPayMembers(workspaceId: string, unitId?: string) {
  return WorkspaceMember.aggregate<TeamPayRow>([
    {
      $match: {
        workspaceId: new Types.ObjectId(workspaceId),
        ...(unitId && { "units.unitId": new Types.ObjectId(unitId) }),
      },
    },
    ...memberAttendsStages(),
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
    {
      $project: {
        _id: 0,
        memberId: "$_id",
        name: { $ifNull: [{ $first: "$user.name" }, { $ifNull: [{ $first: "$user.email" }, "$email"] }] },
        userId: 1,
        attends: 1,
        units: 1,
      },
    },
  ]);
}

// Primeiro e último dia do mês ("2026-10").
export function monthRange(month: string): DayRange {
  const [year, index] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10) };
}

export type PayrollRecordRow = { memberId: string; month: string; salaryCents: number; commissionCents: number; paidOn: string | null };

// Registros da folha da unidade nos meses do intervalo.
export async function findPayrollRecords(unitId: string, { from, to }: DayRange): Promise<PayrollRecordRow[]> {
  const docs = await PayrollPayment.find({ unitId: new Types.ObjectId(unitId), month: { $gte: from.slice(0, 7), $lte: to.slice(0, 7) } })
    .select({ memberId: 1, month: 1, salaryCents: 1, commissionCents: 1, paidOn: 1 })
    .lean();
  return docs.map((doc) => ({
    memberId: doc.memberId.toString(),
    month: doc.month,
    salaryCents: doc.salaryCents,
    commissionCents: doc.commissionCents,
    paidOn: doc.paidOn ?? null,
  }));
}

// Remuneração calculada de cada pessoa no mês inteiro, com as regras do caixa da unidade.
export function monthStaffPay(
  unit: CashFlowUnit,
  team: TeamPayRow[],
  appointments: DayTotal[],
  month: string,
  today: string,
): MemberStaffPay[] {
  const since = parseCashFlowQuery({}, unit.createdAt).date;
  return staffPayByMember(monthRange(month), team, unit.id, appointments, unit.revenueShare, { today, since });
}

// Cada registro com o que o caixa calculou para a pessoa no mês; appointments precisa cobrir os meses.
function payrollAdjustments(
  unit: CashFlowUnit,
  team: TeamPayRow[],
  appointments: DayTotal[],
  records: PayrollRecordRow[],
  today: string,
): PayrollAdjustment[] {
  const zero = { salaryCents: 0, commissionCents: 0 };
  const byMonth = new Map<string, Map<string, MemberStaffPay>>();
  return records.map(({ memberId, month, salaryCents, commissionCents, paidOn }) => {
    let pay = byMonth.get(month);
    if (!pay) {
      pay = new Map(monthStaffPay(unit, team, appointments, month, today).map((row) => [row.memberId, row]));
      byMonth.set(month, pay);
    }
    const computed = pay.get(memberId) ?? { real: zero, forecast: zero };
    return { month, computed: { real: computed.real, forecast: computed.forecast }, payment: { salaryCents, commissionCents, paidOn } };
  });
}

// createdAt: início dos registros da unidade; salário de antes dele não entra no caixa.
export type CashFlowUnit = { id: string; revenueShare: RevenueShare | null; createdAt: Date };

// Líquido real da unidade nos dias do saldo da carteira (até hoje), com as mesmas regras do
// caixa; team é a equipe do workspace.
export async function loadUnitNet(unit: CashFlowUnit, range: DayRange, today: string, team: TeamPayRow[]) {
  const { revenueShare } = unit;
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, expenses, records] = await Promise.all([
    Appointment.aggregate<DayTotal>([
      unitMatch,
      ...dailyAppointmentTotalsPipeline(cashFlowFetchRange([range], revenueShare?.period ?? null)),
    ]),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(range)]),
    findPayrollRecords(unit.id, range),
  ]);
  const { commissionRates, ...staffRates } = teamPayRates(team, unit.id);
  return applyPayrollPayments(
    applyExpenses(
      applyStaffCosts(summarizeCashFlow([range], appointments, [], revenueShare, commissionRates), { ...staffRates, today, since: parseCashFlowQuery({}, unit.createdAt).date }),
      expenses,
    ),
    payrollAdjustments(unit, team, appointments, records, today),
  ).total.real.netCents;
}

// Caixa de uma unidade nos intervalos exibidos, com as regras dela (repasse, equipe e
// despesas). O acesso à unidade é verificado por quem chama.
export async function loadUnitCashFlow(workspaceId: string, unit: CashFlowUnit, buckets: DayRange[], today: string) {
  const { revenueShare } = unit;
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to };
  const range = cashFlowFetchRange(buckets, revenueShare?.period ?? null);
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, team, expenses, groups, groupTotals, payrollRecords] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
    findTeamPayMembers(workspaceId, unit.id),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(shown)]),
    ExpenseGroup.find({ unitId: new Types.ObjectId(unit.id) })
      .select({ name: 1, iconId: 1, monthlyLimitCents: 1, limitChanges: 1 })
      .sort({ name: 1 })
      .lean(),
    Expense.aggregate<ExpenseGroupTotal>([unitMatch, ...expenseGroupTotalsPipeline(shown)]),
    findPayrollRecords(unit.id, shown),
  ]);
  const { commissionRates, ...staffRates } = teamPayRates(team, unit.id);
  const staffCosts = { ...staffRates, today, since: parseCashFlowQuery({}, unit.createdAt).date };
  // A folha registrada troca o calculado de cada pessoa no mês trabalhado.
  const summary = applyPayrollPayments(
    applyExpenses(
      applyStaffCosts(summarizeCashFlow(buckets, appointments, [], revenueShare, commissionRates), staffCosts),
      expenses,
    ),
    payrollAdjustments(unit, team, appointments, payrollRecords, today),
  );
  // Mesmos valores reais da tabela: das despesas, só as pagas.
  const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]));

  return {
    summary,
    appointments,
    team,
    payrollRecords,
    commissionRates,
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      iconId: group.iconId?.toString() ?? null,
      paidCents: paidByGroup.get(group._id.toString()) ?? 0,
    })),
    groupLimits: groups.map(groupLimitsOf),
    hasCommission:
      Object.keys(commissionRates).length > 0 || staffRates.grossCommissionPercent > 0 || staffRates.netCommissionPercent > 0,
    hasSalary: staffRates.salaries.length > 0,
    hasExpenses: expenses.length > 0,
  };
}
