import { isObjectIdOrHexString, Types } from "mongoose"
import {
  cashFlowBuckets,
  costCurve,
  costMonthDate,
  parseCashFlowQuery,
  summarizeCosts,
  summarizeTherapists,
  type CashFlowQuery,
} from "@/lib/cash-flow"
import { CASH_FLOW_PAGE_SIZE } from "@/lib/cash-flow-list"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { expenseGroupTotalsPipeline, summarizeExpenseGroups, type ExpenseGroupTotal, type ExpenseSeries } from "@/lib/expense"
import type { WorkspaceRole } from "@/lib/member"
import type { OpeningBalance } from "@/lib/opening-balance"
import type { RevenueShare } from "@/lib/revenue-share"
import { workspaceAccessStages } from "@/lib/session"
import { loadUnitCashFlow } from "@/lib/unit-cash-flow-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"

// Dados das abas do caixa, usados pela página e pelo export. Não verificam a página oculta
// (quem chama verifica); null sem acesso ao workspace ou sem a unidade.

// Todas as páginas de uma lista paginada, na ordem dela (para exportar tudo o que foi encontrado).
export function allPages<T, R extends { rows: T[]; total: number }>(list: (page: number) => R): R {
  const first = list(1)
  const pages = Math.ceil(first.total / CASH_FLOW_PAGE_SIZE)
  const rest = Array.from({ length: Math.max(pages - 1, 0) }, (_, index) => list(index + 2).rows)
  return { ...first, rows: [first.rows, ...rest].flat() }
}

// O resumo é sempre do ano da data: caixa, custos e massagistas mês a mês no ano; os gastos
// por grupo são de um mês só, o escolhido (costMonth, "AAAA-MM") ou o de hoje dentro do ano mostrado.
export async function loadCashFlowSummaryScreen(
  workspaceId: string,
  userId: string,
  unitId: string,
  date: string,
  now: Date,
  costMonthParam?: string | string[],
) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(unitId)) return null

  // Parte do workspace para garantir o acesso; a regra de repasse define quantos dias buscar.
  const [workspace] = await Workspace.aggregate<{
    id: string
    unit: { name: string; revenueShare: RevenueShare | null; openingBalance: OpeningBalance | null } | null
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $project: {
              _id: 0,
              name: 1,
              revenueShare: { $ifNull: ["$revenueShare", null] },
              openingBalance: { $ifNull: ["$openingBalance", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) return null
  const { name, revenueShare, openingBalance } = workspace.unit
  const today = parseCashFlowQuery({}, now).date
  const buckets = cashFlowBuckets({ view: "year", date })
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const costBuckets = cashFlowBuckets({ view: "month", date: costMonthDate(costMonthParam, shown, today) })
  const costMonth = { from: costBuckets[0].from, to: costBuckets.at(-1)!.to }
  const unit = { id: unitId, revenueShare, openingBalance }
  const [
    {
      summary,
      balanceCents,
      appointments,
      commissionRates,
      monthlyBudgetCents,
      hasCommission,
      hasSalary,
      hasExpenses,
    },
    month,
    icons,
  ] = await Promise.all([
    loadUnitCashFlow(workspace.id, unit, buckets, today),
    loadUnitCashFlow(workspace.id, unit, costBuckets, today),
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const costs = summarizeCosts(
    month.summary.total.real,
    month.groups.map(({ iconId, ...group }) => ({ ...group, icon: (iconId && iconsById.get(iconId)) || null })),
  )

  return {
    unitName: name,
    today,
    shown,
    revenueShare,
    openingBalance,
    balanceCents,
    summary,
    columns: { partnerShare: !!revenueShare, commission: hasCommission, salary: hasSalary, expenses: hasExpenses },
    therapists: summarizeTherapists(shown, appointments, [], commissionRates),
    costMonth,
    costs,
    curve: costCurve([{ buckets: summary.buckets, monthlyBudgetCents }], today),
  }
}

export async function loadExpensesScreen(workspaceId: string, userId: string, unitId: string, query: CashFlowQuery) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(unitId)) return null

  // Parte do workspace para garantir o acesso à unidade.
  const [workspace] = await Workspace.aggregate<{ role: WorkspaceRole; unit: { name: string } | null }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: new Types.ObjectId(unitId) } }, { $project: { _id: 0, name: 1 } }],
      },
    },
    { $project: { _id: 0, role: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) return null

  const buckets = cashFlowBuckets(query)
  const month = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unitObjectId = new Types.ObjectId(unitId)
  const [groupDocs, expenseDocs, icons] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId })
      .sort({ name: 1 })
      .collation({ locale: "pt" })
      .select({ name: 1, iconId: 1 })
      .lean(),
    Expense.find({ unitId: unitObjectId, date: { $gte: month.from, $lte: month.to } })
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
  }))
  const expenses = expenseDocs.map((expense) => ({
    id: expense._id.toString(),
    groupId: expense.groupId.toString(),
    description: expense.description,
    amountCents: expense.amountCents,
    date: expense.date,
    paid: !!expense.paidAt,
    series: expense.series
      ? {
          kind: expense.series.kind as ExpenseSeries["kind"],
          number: expense.series.number,
          count: expense.series.count,
        }
      : null,
  }))

  return { unitName: workspace.unit.name, role: workspace.role, month, groups, expenses }
}

// O limite é mensal: no ano, vale 12 vezes.
export async function loadExpenseGroupsScreen(
  workspaceId: string,
  userId: string,
  unitId: string,
  query: { view: "month" | "year"; date: string },
) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(unitId)) return null

  // Parte do workspace para garantir o acesso à unidade.
  const [workspace] = await Workspace.aggregate<{ role: WorkspaceRole; unit: { name: string } | null }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: new Types.ObjectId(unitId) } }, { $project: { _id: 0, name: 1 } }],
      },
    },
    { $project: { _id: 0, role: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) return null

  const buckets = cashFlowBuckets(query)
  const period = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unitObjectId = new Types.ObjectId(unitId)
  const [groups, totals, icons] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId }).select({ name: 1, monthlyLimitCents: 1, iconId: 1 }).lean(),
    Expense.aggregate<ExpenseGroupTotal>([{ $match: { unitId: unitObjectId } }, ...expenseGroupTotalsPipeline(period)]),
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const summary = summarizeExpenseGroups(
    groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      monthlyLimitCents: group.monthlyLimitCents ?? null,
      icon: (group.iconId && iconsById.get(group.iconId.toString())) || null,
    })),
    totals,
    query.view === "year" ? 12 : 1,
  )

  return { unitName: workspace.unit.name, role: workspace.role, period, icons, summary }
}
