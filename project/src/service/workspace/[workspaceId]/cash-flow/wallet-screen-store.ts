import { isObjectIdOrHexString, Types } from "mongoose"
import { cashFlowBuckets, parseCashFlowQuery, type CashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { loadExpenseGroupIcons } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon-store"
import {
  expenseGroupMonthTotalsPipeline,
  expenseGroupTotalsPipeline,
  expenseGroupYearOverview,
  groupLimitForMonth,
  summarizeExpenseGroups,
  type ExpenseGroupMonthTotal,
  type ExpenseGroupTotal,
  type ExpenseSeries,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { workspaceAccessStages } from "@/service/(auth)/session"
import { groupLimitsOf } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { loadWallets } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"

// Dados das abas do caixa da carteira: as despesas e o planejamento em conjunto das unidades
// dela. Não verificam a página oculta (quem chama verifica); null sem acesso ao workspace ou
// sem a carteira.

// Carteira do workspace, com o nome das unidades dela.
export async function loadWalletAccess(workspaceId: string, userId: string, walletId: string) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(walletId)) return null

  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    wallet: { name: string; unitIds: Types.ObjectId[] } | null
    units: { id: string; name: string }[]
  }>([
    ...access,
    {
      $lookup: {
        from: "wallets",
        localField: "_id",
        foreignField: "workspaceId",
        as: "wallet",
        pipeline: [
          { $match: { _id: new Types.ObjectId(walletId) } },
          { $project: { _id: 0, name: 1, unitIds: "$units.unitId" } },
        ],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        actor: 1,
        wallet: { $ifNull: [{ $first: "$wallet" }, null] },
        units: 1,
      },
    },
  ])
  if (!workspace?.wallet) return null
  const unitIds = new Set(workspace.wallet.unitIds.map(String))
  return {
    workspaceId: workspace.id,
    actor: workspace.actor,
    wallet: {
      id: walletId,
      name: workspace.wallet.name,
      units: workspace.units.filter((unit) => unitIds.has(unit.id)),
    },
  }
}

// Saldo de hoje e o mês a mês do ano dos grupos da carteira (planejado e pago).
export async function loadWalletSummaryScreen(
  workspaceId: string,
  userId: string,
  walletId: string,
  date: string,
  now: Date,
) {
  const found = await loadWalletAccess(workspaceId, userId, walletId)
  if (!found) return null

  const today = parseCashFlowQuery({}, now).date
  const year = date.slice(0, 4)
  const owner = new Types.ObjectId(walletId)
  const [wallets, groups, monthTotals] = await Promise.all([
    loadWallets(found.workspaceId, today),
    ExpenseGroup.find({ walletId: owner }).select({ name: 1, monthlyLimitCents: 1, limitChanges: 1 }).lean(),
    Expense.aggregate<ExpenseGroupMonthTotal>([
      { $match: { walletId: owner } },
      ...expenseGroupMonthTotalsPipeline({ from: `${year}-01-01`, to: `${year}-12-31` }),
    ]),
  ])
  const view = wallets.find((wallet) => wallet.id === walletId) ?? null
  const infos = groups.map((group) => ({ id: group._id.toString(), name: group.name, ...groupLimitsOf(group) }))

  return {
    ...found,
    today,
    year,
    balance: view && { balanceCents: view.balanceCents, openingBalance: view.openingBalance },
    overview: expenseGroupYearOverview(infos, monthTotals, year),
  }
}

export async function loadWalletExpensesScreen(
  workspaceId: string,
  userId: string,
  walletId: string,
  query: CashFlowQuery,
) {
  const found = await loadWalletAccess(workspaceId, userId, walletId)
  if (!found) return null

  const buckets = cashFlowBuckets(query)
  const month = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const owner = new Types.ObjectId(walletId)
  const [groupDocs, expenseDocs, icons] = await Promise.all([
    ExpenseGroup.find({ walletId: owner }).sort({ name: 1 }).collation({ locale: "pt" }).select({ name: 1, iconId: 1 }).lean(),
    Expense.find({ walletId: owner, date: { $gte: month.from, $lte: month.to } })
      .sort({ date: 1, createdAt: 1 })
      .select({ groupId: 1, description: 1, amountCents: 1, date: 1, paidAt: 1, series: 1 })
      .lean(),
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const groups = groupDocs.map((group) => ({
    id: group._id.toString(),
    name: group.name,
    icon: (group.iconId && iconsById.get(group.iconId.toString())) || null,
    automatic: false,
  }))
  const expenses = expenseDocs.map((expense) => ({
    id: expense._id.toString(),
    groupId: expense.groupId.toString(),
    description: expense.description,
    amountCents: expense.amountCents,
    date: expense.date,
    paid: !!expense.paidAt,
    series: expense.series
      ? { kind: expense.series.kind as ExpenseSeries["kind"], number: expense.series.number, count: expense.series.count }
      : null,
    automatic: false,
  }))

  return { ...found, month, groups, expenses }
}

// O limite é de cada mês: no ano, soma os 12; no ano, também vem o mês a mês de cada grupo.
export async function loadWalletGroupsScreen(
  workspaceId: string,
  userId: string,
  walletId: string,
  query: { view: "month" | "year"; date: string },
  now: Date,
) {
  const found = await loadWalletAccess(workspaceId, userId, walletId)
  if (!found) return null

  const today = parseCashFlowQuery({}, now).date
  const buckets = cashFlowBuckets(query)
  const period = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const owner = new Types.ObjectId(walletId)
  const year = query.date.slice(0, 4)
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
  const months = query.view === "year" ? yearMonths : [query.date.slice(0, 7)]
  const [groups, totals, monthTotals, icons] = await Promise.all([
    ExpenseGroup.find({ walletId: owner }).select({ name: 1, monthlyLimitCents: 1, limitChanges: 1, iconId: 1 }).lean(),
    Expense.aggregate<ExpenseGroupTotal>([{ $match: { walletId: owner } }, ...expenseGroupTotalsPipeline(period)]),
    query.view === "year"
      ? Expense.aggregate<ExpenseGroupMonthTotal>([
          { $match: { walletId: owner } },
          ...expenseGroupMonthTotalsPipeline({ from: `${year}-01-01`, to: `${year}-12-31` }),
        ])
      : [],
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const infos = groups.map((group) => ({ id: group._id.toString(), name: group.name, ...groupLimitsOf(group) }))
  const summary = summarizeExpenseGroups(
    infos.map((group, i) => ({
      ...group,
      icon: (groups[i].iconId && iconsById.get(groups[i].iconId.toString())) || null,
      limits: yearMonths.map((month) => groupLimitForMonth(group, month)),
    })),
    totals,
    months,
  )
  // O limite novo vale, por padrão, do mês exibido; no ano, do mês de hoje se estiver nele.
  const defaultMonth =
    query.view === "month" ? query.date.slice(0, 7) : today.startsWith(year) ? today.slice(0, 7) : `${year}-01`
  const overview = query.view === "year" ? expenseGroupYearOverview(infos, monthTotals, year) : null

  return { ...found, period, icons, summary, limitMonths: { months: yearMonths, defaultMonth }, overview }
}
