import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { cashFlowBuckets, costCurve, parseCashFlowQuery, summarizeCosts, summarizeTherapists } from "@/lib/cash-flow"
import { CASH_FLOW_PAGE_SIZE, parseTherapistListQuery, therapistListPage } from "@/lib/cash-flow-list"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import type { OpeningBalance } from "@/lib/opening-balance"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { loadUnitCashFlow } from "@/lib/unit-cash-flow-store"
import { Workspace } from "@/models/Workspace"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { OpeningBalanceCard } from "@/components/opening-balance-card"
import { CashFlowTable } from "@/components/cash-flow-table"
import { CashFlowCostsChart } from "@/components/cash-flow-costs-chart"
import { CostCumulativeChart, CostPeriodChart } from "@/components/cost-curve-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  const buckets = cashFlowBuckets(query)
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unit = { id: unitId, ...workspace.unit }
  // Os gráficos de custo são sempre do ano da data exibida, mês a mês.
  const yearQuery = { view: "year", date: query.date } as const
  const [
    { summary, balanceCents, appointments, commissionRates, groups, monthlyBudgetCents, hasCommission, hasSalary, hasExpenses },
    yearSummary,
    icons,
  ] = await Promise.all([
    loadUnitCashFlow(workspace.id, unit, buckets, today),
    query.view === "year"
      ? null
      : loadUnitCashFlow(workspace.id, unit, cashFlowBuckets(yearQuery), today).then(({ summary }) => summary),
    loadExpenseGroupIcons(),
  ])
  const therapists = therapistListPage(summarizeTherapists(shown, appointments, [], commissionRates), {
    ...filters,
    page,
  })
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const costs = summarizeCosts(
    summary.total.real,
    groups.map(({ iconId, ...group }) => ({ ...group, icon: (iconId && iconsById.get(iconId)) || null })),
  )

  const curve = costCurve([{ buckets: (yearSummary ?? summary).buckets, monthlyBudgetCents }], today)

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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Custo por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <CostPeriodChart points={curve} view="year" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Custo acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <CostCumulativeChart points={curve} view="year" />
          </CardContent>
        </Card>
      </div>
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
