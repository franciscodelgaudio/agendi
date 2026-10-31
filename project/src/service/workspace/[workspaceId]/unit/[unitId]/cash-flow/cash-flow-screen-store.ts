import { isObjectIdOrHexString, Types } from "mongoose"
import {
  cashFlowBuckets,
  costCurve,
  costMonthDate,
  parseCashFlowQuery,
  summarizeCosts,
  summarizeTherapists,
  type CashFlowQuery,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { CASH_FLOW_PAGE_SIZE } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
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
import {
  groupLimitsOf,
  loadUnitCashFlow,
  loadUnitNet,
  type CashFlowUnit,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { loadWallets } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
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

// O resumo é sempre do ano da data: caixa, custos e profissionais mês a mês no ano; os gastos
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

  // Parte do workspace para garantir o acesso.
  const [workspace] = await Workspace.aggregate<{
    id: string
    unit: { name: string; createdAt: Date } | null
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
            $project: { _id: 0, name: 1, createdAt: 1 },
          },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) return null
  const { name, createdAt } = workspace.unit
  const today = parseCashFlowQuery({}, now).date
  const buckets = cashFlowBuckets({ view: "year", date })
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const costBuckets = cashFlowBuckets({ view: "month", date: costMonthDate(costMonthParam, shown, today) })
  const costMonth = { from: costBuckets[0].from, to: costBuckets.at(-1)!.to }
  const unit = { id: unitId }
  const [{ summary, appointments, groupLimits, hasExpenses }, month, icons, [wallet]] = await Promise.all([
    loadUnitCashFlow(unit, buckets),
    loadUnitCashFlow(unit, costBuckets),
    loadExpenseGroupIcons(),
    loadWallets(workspace.id, today, unitId),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const costs = summarizeCosts(
    month.groups.map(({ iconId, ...group }) => ({ ...group, icon: (iconId && iconsById.get(iconId)) || null })),
  )

  // Na carteira compartilhada a unidade não tem saldo próprio: vale o da carteira.
  const walletUnit = wallet?.units.find((unit) => unit.id === unitId)
  const ownShare = walletUnit?.amountCents ?? null
  const balanceCents = wallet
    ? (walletUnit?.balanceCents ?? wallet.balanceCents)
    : await loadUnitBalance(unit, createdAt, today)

  return {
    unitName: name,
    today,
    shown,
    // Carteira da unidade; null quando ela não está em nenhuma.
    wallet: wallet ?? null,
    // Sem carteira, o saldo é o líquido real da unidade desde o início dela.
    balanceCents,
    // Na carteira distribuída, o saldo inicial é a parte da unidade.
    openingBalance: wallet
      ? ownShare !== null
        ? { amountCents: ownShare, date: wallet.openingBalance.date }
        : wallet.openingBalance
      : null,
    summary,
    columns: { expenses: hasExpenses },
    therapists: summarizeTherapists(shown, appointments, []),
    costMonth,
    costs,
    curve: costCurve([{ buckets: summary.buckets, groups: groupLimits }]),
  }
}

// Líquido real da unidade sem carteira, do dia em que foi criada (ou da primeira despesa, se
// lançada antes) até hoje, com as mesmas regras do caixa.
async function loadUnitBalance(unit: CashFlowUnit, createdAt: Date, today: string) {
  const firstExpense = await Expense.findOne({ unitId: new Types.ObjectId(unit.id) }).sort({ date: 1 }).select({ date: 1 }).lean()
  const created = parseCashFlowQuery({}, createdAt).date
  const from = firstExpense && firstExpense.date < created ? firstExpense.date : created
  return from <= today ? loadUnitNet(unit, { from, to: today }) : 0
}

export async function loadExpensesScreen(
  workspaceId: string,
  userId: string,
  unitId: string,
  query: CashFlowQuery,
) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(unitId)) return null

  // Parte do workspace para garantir o acesso à unidade.
  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    unit: { name: string; createdAt: Date } | null
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
          { $project: { _id: 0, name: 1, createdAt: 1 } },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
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

  return { unitName: workspace.unit.name, actor: workspace.actor, month, groups, expenses }
}

// O limite é de cada mês: no ano, soma os 12.
// No ano, também vem o mês a mês de cada grupo cadastrado.
export async function loadExpenseGroupsScreen(
  workspaceId: string,
  userId: string,
  unitId: string,
  query: { view: "month" | "year"; date: string },
  now: Date,
) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access || !isObjectIdOrHexString(unitId)) return null

  // Parte do workspace para garantir o acesso à unidade.
  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    unit: { name: string; createdAt: Date } | null
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
          { $project: { _id: 0, name: 1, createdAt: 1 } },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) return null

  const today = parseCashFlowQuery({}, now).date
  const buckets = cashFlowBuckets(query)
  const period = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unitObjectId = new Types.ObjectId(unitId)
  const year = query.date.slice(0, 4)
  const yearRange = { from: `${year}-01-01`, to: `${year}-12-31` }
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
  const months = query.view === "year" ? yearMonths : [query.date.slice(0, 7)]
  const [groups, totals, monthTotals, icons] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId })
      .select({ name: 1, monthlyLimitCents: 1, limitChanges: 1, iconId: 1 })
      .lean(),
    Expense.aggregate<ExpenseGroupTotal>([{ $match: { unitId: unitObjectId } }, ...expenseGroupTotalsPipeline(period)]),
    query.view === "year"
      ? Expense.aggregate<ExpenseGroupMonthTotal>([
          { $match: { unitId: unitObjectId } },
          ...expenseGroupMonthTotalsPipeline(yearRange),
        ])
      : [],
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const infos = groups.map((group) => ({
    id: group._id.toString(),
    name: group.name,
    ...groupLimitsOf(group),
  }))
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

  return {
    unitName: workspace.unit.name,
    actor: workspace.actor,
    period,
    icons,
    summary,
    limitMonths: { months: yearMonths, defaultMonth },
    overview,
  }
}
