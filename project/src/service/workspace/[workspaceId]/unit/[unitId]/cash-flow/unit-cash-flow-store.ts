import { Types } from "mongoose";
import {
  applyExpenses,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  summarizeCashFlow,
  type DayRange,
  type DayTotal,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";
import {
  dailyExpenseTotalsPipeline,
  expenseGroupTotalsPipeline,
  type ExpenseDayTotal,
  type ExpenseGroupTotal,
  type GroupLimits,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";
import { Appointment } from "@/models/Appointment";
import { Expense } from "@/models/Expense";
import { ExpenseGroup } from "@/models/ExpenseGroup";

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

export type CashFlowUnit = { id: string };

// Líquido real da unidade nos dias do saldo da carteira (até hoje), com as mesmas regras do caixa.
export async function loadUnitNet(unit: CashFlowUnit, range: DayRange) {
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, expenses] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(range)]),
  ]);
  return applyExpenses(summarizeCashFlow([range], appointments, []), expenses).total.real.netCents;
}

// Caixa de uma unidade nos intervalos exibidos, com as despesas dela. O
// acesso à unidade é verificado por quem chama.
export async function loadUnitCashFlow(unit: CashFlowUnit, buckets: DayRange[]) {
  const shown = cashFlowFetchRange(buckets);
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, expenses, groups, groupTotals] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(shown)]),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(shown)]),
    ExpenseGroup.find({ unitId: new Types.ObjectId(unit.id) })
      .select({ name: 1, iconId: 1, monthlyLimitCents: 1, limitChanges: 1 })
      .sort({ name: 1 })
      .lean(),
    Expense.aggregate<ExpenseGroupTotal>([unitMatch, ...expenseGroupTotalsPipeline(shown)]),
  ]);
  const summary = applyExpenses(summarizeCashFlow(buckets, appointments, []), expenses);
  // Mesmos valores reais da tabela: das despesas, só as pagas.
  const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]));

  return {
    summary,
    appointments,
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      iconId: group.iconId?.toString() ?? null,
      paidCents: paidByGroup.get(group._id.toString()) ?? 0,
    })),
    groupLimits: groups.map(groupLimitsOf),
    hasExpenses: expenses.length > 0,
  };
}
