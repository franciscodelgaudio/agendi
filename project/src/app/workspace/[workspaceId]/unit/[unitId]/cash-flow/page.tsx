import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowBuckets,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  parseCashFlowQuery,
  summarizeCashFlow,
  summarizeCosts,
  summarizeTherapists,
  teamPayRates,
  type DayTotal,
} from "@/lib/cash-flow"
import { CASH_FLOW_PAGE_SIZE, parseTherapistListQuery, therapistListPage } from "@/lib/cash-flow-list"
import {
  dailyExpenseTotalsPipeline,
  expenseGroupTotalsPipeline,
  type ExpenseDayTotal,
  type ExpenseGroupTotal,
} from "@/lib/expense"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { openingBalanceRange, type OpeningBalance } from "@/lib/opening-balance"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Appointment } from "@/models/Appointment"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { OpeningBalanceCard } from "@/components/opening-balance-card"
import { CashFlowTable } from "@/components/cash-flow-table"
import { CashFlowCostsChart } from "@/components/cash-flow-costs-chart"
import { CashFlowTherapistsTable } from "@/components/cash-flow-therapists-table"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function CashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  const search = await searchParams
  const query = parseCashFlowQuery(search, now)
  // Busca e ordenação mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = parseTherapistListQuery(search)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace para garantir o acesso; a regra de repasse define quantos dias buscar.
  const [workspace] = await Workspace.aggregate<{
    id: string
    unit: { revenueShare: RevenueShare | null; openingBalance: OpeningBalance | null } | null
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
              revenueShare: { $ifNull: ["$revenueShare", null] },
              openingBalance: { $ifNull: ["$openingBalance", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { revenueShare, openingBalance } = workspace.unit
  const today = parseCashFlowQuery({}, now).date
  // Dias cujo líquido real soma no saldo em caixa de hoje.
  const balanceRange = openingBalance && openingBalanceRange(openingBalance, today)

  const buckets = cashFlowBuckets(query)
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const range = cashFlowFetchRange(buckets, revenueShare?.period ?? null)
  const unitMatch = { $match: { unitId: new Types.ObjectId(unitId) } }
  const [appointments, team, balanceAppointments, expenses, balanceExpenses, groups, groupTotals, icons] =
    await Promise.all([
      Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
      // Remuneração da equipe vinculada a esta unidade (o proprietário não tem).
      WorkspaceMember.find({
        workspaceId: workspace.id,
        role: { $in: ["massage_therapist", "receptionist"] },
        "units.unitId": unitId,
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
      ExpenseGroup.find({ unitId: new Types.ObjectId(unitId) }).select({ name: 1, iconId: 1 }).sort({ name: 1 }).lean(),
      Expense.aggregate<ExpenseGroupTotal>([unitMatch, ...expenseGroupTotalsPipeline(shown)]),
      loadExpenseGroupIcons(),
    ])
  const { commissionRates, grossCommissionPercent, monthlySalaryCents } = teamPayRates(team, unitId)
  const staffCosts = { grossCommissionPercent, monthlySalaryCents, today }
  const summary = applyExpenses(
    applyStaffCosts(summarizeCashFlow(buckets, appointments, [], revenueShare, commissionRates), staffCosts),
    expenses,
  )
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
        : 0)
  const therapists = therapistListPage(summarizeTherapists(shown, appointments, [], commissionRates), {
    ...filters,
    page,
  })
  // Mesmos valores reais da tabela: das despesas, só as pagas.
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const paidByGroup = new Map(groupTotals.map((total) => [total.groupId, total.paidCents]))
  const costs = summarizeCosts(
    summary.total.real,
    groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      icon: (group.iconId && iconsById.get(group.iconId.toString())) || null,
      paidCents: paidByGroup.get(group._id.toString()) ?? 0,
    })),
  )
  const hasCommission = Object.keys(commissionRates).length > 0 || grossCommissionPercent > 0
  const hasSalary = monthlySalaryCents > 0
  const hasExpenses = expenses.length > 0

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const listQuery = { view: query.view, date: query.date, ...filters }
  // Página além da última (ex.: depois de trocar de período) vai para a última.
  const pages = Math.ceil(therapists.total / CASH_FLOW_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <OpeningBalanceCard openingBalance={openingBalance} balanceCents={balanceCents} />
      <CashFlowNav
        query={query}
        range={shown}
        isCurrent={shown.from <= today && today <= shown.to}
        today={today}
        pathname={pathname}
        preserve={filters}
      />
      <CashFlowTable
        view={query.view}
        summary={summary}
        hasPartnerShare={!!revenueShare}
        hasCommission={hasCommission}
        hasSalary={hasSalary}
        hasExpenses={hasExpenses}
        today={today}
      />
      {costs.rows.length > 0 && <CashFlowCostsChart rows={costs.rows} totalCents={costs.totalCents} />}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold tracking-tight">Por massagista</h4>
        <ListSearch query={listQuery} placeholder="Buscar massagista..." />
      </div>
      <CashFlowTherapistsTable
        therapists={therapists.rows}
        sums={therapists.sums}
        query={listQuery}
        pathname={pathname}
      />
      <ListPagination
        query={listQuery}
        page={page}
        pageSize={CASH_FLOW_PAGE_SIZE}
        total={therapists.total}
        pathname={pathname}
        itemLabel="massagistas"
      />
    </div>
  )
}
