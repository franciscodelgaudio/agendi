import { Types } from "mongoose";
import { openingBalanceRange, type OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { findTeamPayMembers, groupLimitsOf, loadUnitNet } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store";
import { walletBalance } from "@/service/workspace/[workspaceId]/cash-flow/wallet";
import {
  dailyExpenseTotalsPipeline,
  expenseGroupTotalsPipeline,
  type ExpenseDayTotal,
  type ExpenseGroupTotal,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";
import type { DayRange } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";
import { walletExpenseSummary } from "@/service/workspace/[workspaceId]/cash-flow/cash-flow-overview";
import { Expense } from "@/models/Expense";
import { ExpenseGroup } from "@/models/ExpenseGroup";
import { Unit } from "@/models/Unit";
import { Wallet } from "@/models/Wallet";

export type WalletView = {
  id: string;
  name: string;
  openingBalance: OpeningBalance;
  balanceCents: number;
  undistributedCents: number | null;
  // amountCents: parte do saldo inicial; balanceCents: saldo da unidade (null na carteira compartilhada).
  units: { id: string; name: string; amountCents: number | null; balanceCents: number | null }[];
};

// Carteiras do workspace com o saldo de hoje, por nome; com unitId, só a carteira dela (lista
// vazia sem carteira). O acesso ao workspace é verificado por quem chama.
export async function loadWallets(workspaceId: string, today: string, unitId?: string): Promise<WalletView[]> {
  const workspace = new Types.ObjectId(workspaceId);
  const [wallets, units, team] = await Promise.all([
    Wallet.find({ workspaceId: workspace, ...(unitId && { "units.unitId": new Types.ObjectId(unitId) }) })
      .sort({ name: 1, _id: 1 })
      .lean(),
    Unit.find({ workspaceId: workspace }).select({ name: 1, revenueShare: 1 }).lean(),
    findTeamPayMembers(workspaceId),
  ]);
  const unitsById = new Map(
    units.map((unit) => [
      unit._id.toString(),
      { name: unit.name, revenueShare: (unit.revenueShare ?? null) as RevenueShare | null },
    ]),
  );

  return Promise.all(
    wallets.map(async (wallet) => {
      const openingBalance = { amountCents: wallet.openingBalance.amountCents, date: wallet.openingBalance.date };
      // Unidade excluída sai da carteira; por garantia, a que não existe mais é ignorada.
      const walletUnits = wallet.units
        .map((unit) => ({ unitId: unit.unitId.toString(), amountCents: unit.amountCents ?? null }))
        .filter((unit) => unitsById.has(unit.unitId));
      const range = openingBalanceRange(openingBalance, today);
      const [nets, walletExpenseCents] = await Promise.all([
        Promise.all(
          walletUnits.map(({ unitId }) =>
            range ? loadUnitNet({ id: unitId, revenueShare: unitsById.get(unitId)!.revenueShare }, range, today, team) : 0,
          ),
        ),
        range ? walletPaidExpenses(wallet._id, range) : 0,
      ]);
      const balance = walletBalance(
        { openingBalance, units: walletUnits },
        Object.fromEntries(walletUnits.map((unit, i) => [unit.unitId, nets[i]])),
        walletExpenseCents,
      );
      return {
        id: wallet._id.toString(),
        name: wallet.name,
        openingBalance,
        balanceCents: balance.balanceCents,
        undistributedCents: balance.undistributedCents,
        units: walletUnits.map((unit, i) => ({
          id: unit.unitId,
          name: unitsById.get(unit.unitId)!.name,
          amountCents: unit.amountCents,
          balanceCents: balance.units[i].balanceCents,
        })),
      };
    }),
  );
}

// Despesas pagas da própria carteira no intervalo, pelo dia do lançamento.
async function walletPaidExpenses(walletId: Types.ObjectId, range: { from: string; to: string }) {
  const days = await Expense.aggregate<ExpenseDayTotal>([{ $match: { walletId } }, ...dailyExpenseTotalsPipeline(range)]);
  return days.reduce((sum, day) => sum + day.paidCents, 0);
}

// Despesas das carteiras do workspace nos intervalos do caixa, no mesmo formato do caixa de uma
// unidade, para somar com elas: resumo, gasto pago por grupo e limites dos grupos.
export async function loadWalletCashFlows(workspaceId: string, buckets: DayRange[]) {
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to };
  const walletIds = (await Wallet.find({ workspaceId: new Types.ObjectId(workspaceId) }).select({ _id: 1 }).lean()).map(
    (wallet) => wallet._id,
  );
  return Promise.all(
    walletIds.map(async (walletId) => {
      const match = { $match: { walletId } };
      const [expenses, groups, groupTotals] = await Promise.all([
        Expense.aggregate<ExpenseDayTotal>([match, ...dailyExpenseTotalsPipeline(shown)]),
        ExpenseGroup.find({ walletId }).select({ name: 1, iconId: 1, monthlyLimitCents: 1, limitChanges: 1 }).sort({ name: 1 }).lean(),
        Expense.aggregate<ExpenseGroupTotal>([match, ...expenseGroupTotalsPipeline(shown)]),
      ]);
      const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]));
      return {
        summary: walletExpenseSummary(buckets, expenses),
        groups: groups.map((group) => ({
          id: group._id.toString(),
          name: group.name,
          iconId: group.iconId?.toString() ?? null,
          paidCents: paidByGroup.get(group._id.toString()) ?? 0,
        })),
        groupLimits: groups.map(groupLimitsOf),
        hasExpenses: expenses.length > 0,
      };
    }),
  );
}
