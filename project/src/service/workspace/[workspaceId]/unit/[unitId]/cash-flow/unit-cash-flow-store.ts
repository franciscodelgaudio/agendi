import { Types } from "mongoose";
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  summarizeCashFlow,
  teamPayRates,
  type DayRange,
  type DayTotal,
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

// Remuneração da equipe (administradores inclusive), só a vinculada à unidade quando ela vem.
export function findTeamPayMembers(workspaceId: string, unitId?: string) {
  return WorkspaceMember.aggregate<TeamPayMember>([
    {
      $match: {
        workspaceId: new Types.ObjectId(workspaceId),
        ...(unitId && { "units.unitId": new Types.ObjectId(unitId) }),
      },
    },
    ...memberAttendsStages(),
    { $project: { _id: 0, userId: 1, attends: 1, units: 1 } },
  ]);
}

export type CashFlowUnit = { id: string; revenueShare: RevenueShare | null };

// Líquido real da unidade nos dias do saldo da carteira (até hoje), com as mesmas regras do
// caixa; team é a equipe do workspace.
export async function loadUnitNet(unit: CashFlowUnit, range: DayRange, today: string, team: TeamPayMember[]) {
  const { revenueShare } = unit;
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, expenses] = await Promise.all([
    Appointment.aggregate<DayTotal>([
      unitMatch,
      ...dailyAppointmentTotalsPipeline(cashFlowFetchRange([range], revenueShare?.period ?? null)),
    ]),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(range)]),
  ]);
  const { commissionRates, ...staffRates } = teamPayRates(team, unit.id);
  return applyExpenses(
    applyStaffCosts(summarizeCashFlow([range], appointments, [], revenueShare, commissionRates), { ...staffRates, today }),
    expenses,
  ).total.real.netCents;
}

// Caixa de uma unidade nos intervalos exibidos, com as regras dela (repasse, equipe e
// despesas). O acesso à unidade é verificado por quem chama.
export async function loadUnitCashFlow(workspaceId: string, unit: CashFlowUnit, buckets: DayRange[], today: string) {
  const { revenueShare } = unit;
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to };
  const range = cashFlowFetchRange(buckets, revenueShare?.period ?? null);
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, team, expenses, groups, groupTotals] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
    findTeamPayMembers(workspaceId, unit.id),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(shown)]),
    ExpenseGroup.find({ unitId: new Types.ObjectId(unit.id) })
      .select({ name: 1, iconId: 1, monthlyLimitCents: 1, limitChanges: 1 })
      .sort({ name: 1 })
      .lean(),
    Expense.aggregate<ExpenseGroupTotal>([unitMatch, ...expenseGroupTotalsPipeline(shown)]),
  ]);
  const { commissionRates, ...staffRates } = teamPayRates(team, unit.id);
  const staffCosts = { ...staffRates, today };
  const summary = applyExpenses(
    applyStaffCosts(summarizeCashFlow(buckets, appointments, [], revenueShare, commissionRates), staffCosts),
    expenses,
  );
  // Mesmos valores reais da tabela: das despesas, só as pagas.
  const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]));

  return {
    summary,
    appointments,
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
