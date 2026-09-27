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
} from "@/lib/cash-flow";
import {
  dailyExpenseTotalsPipeline,
  expenseBudgetCents,
  expenseGroupTotalsPipeline,
  type ExpenseDayTotal,
  type ExpenseGroupTotal,
} from "@/lib/expense";
import { openingBalanceRange, type OpeningBalance } from "@/lib/opening-balance";
import type { RevenueShare } from "@/lib/revenue-share";
import { Appointment } from "@/models/Appointment";
import { Expense } from "@/models/Expense";
import { ExpenseGroup } from "@/models/ExpenseGroup";
import { WorkspaceMember } from "@/models/WorkspaceMember";

export type CashFlowUnit = { id: string; revenueShare: RevenueShare | null; openingBalance: OpeningBalance | null };

// Caixa de uma unidade nos intervalos exibidos, com as regras dela (repasse, equipe e
// despesas), e o saldo em caixa de hoje. O acesso à unidade é verificado por quem chama.
export async function loadUnitCashFlow(workspaceId: string, unit: CashFlowUnit, buckets: DayRange[], today: string) {
  const { revenueShare, openingBalance } = unit;
  // Dias cujo líquido real soma no saldo em caixa de hoje.
  const balanceRange = openingBalance && openingBalanceRange(openingBalance, today);
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to };
  const range = cashFlowFetchRange(buckets, revenueShare?.period ?? null);
  const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } };
  const [appointments, team, balanceAppointments, expenses, balanceExpenses, groups, groupTotals] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
    // Remuneração da equipe vinculada a esta unidade (o proprietário não tem).
    WorkspaceMember.find({
      workspaceId,
      role: { $in: ["massage_therapist", "receptionist"] },
      "units.unitId": unit.id,
    })
      .select({ userId: 1, role: 1, units: 1 })
      .lean(),
    balanceRange
      ? Appointment.aggregate<DayTotal>([
          unitMatch,
          ...dailyAppointmentTotalsPipeline(cashFlowFetchRange([balanceRange], revenueShare?.period ?? null)),
        ])
      : [],
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(shown)]),
    balanceRange ? Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(balanceRange)]) : [],
    ExpenseGroup.find({ unitId: new Types.ObjectId(unit.id) })
      .select({ name: 1, iconId: 1, monthlyLimitCents: 1 })
      .sort({ name: 1 })
      .lean(),
    Expense.aggregate<ExpenseGroupTotal>([unitMatch, ...expenseGroupTotalsPipeline(shown)]),
  ]);
  const { commissionRates, grossCommissionPercent, salaries } = teamPayRates(team, unit.id);
  const staffCosts = { grossCommissionPercent, salaries, today };
  const summary = applyExpenses(
    applyStaffCosts(summarizeCashFlow(buckets, appointments, [], revenueShare, commissionRates), staffCosts),
    expenses,
  );
  const balanceCents = !openingBalance
    ? null
    : openingBalance.amountCents +
      (balanceRange
        ? applyExpenses(
            applyStaffCosts(
              summarizeCashFlow([balanceRange], balanceAppointments, [], revenueShare, commissionRates),
              staffCosts,
            ),
            balanceExpenses,
          ).total.real.netCents
        : 0);
  // Mesmos valores reais da tabela: das despesas, só as pagas.
  const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]));

  return {
    summary,
    balanceCents,
    appointments,
    commissionRates,
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      iconId: group.iconId?.toString() ?? null,
      paidCents: paidByGroup.get(group._id.toString()) ?? 0,
    })),
    monthlyBudgetCents: expenseBudgetCents(groups.map((group) => ({ monthlyLimitCents: group.monthlyLimitCents ?? null }))),
    hasCommission: Object.keys(commissionRates).length > 0 || grossCommissionPercent > 0,
    hasSalary: salaries.length > 0,
    hasExpenses: expenses.length > 0,
  };
}
