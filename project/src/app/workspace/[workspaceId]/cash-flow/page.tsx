import { notFound } from "next/navigation"
import {
  cashFlowBuckets,
  costCurve,
  costMonthDate,
  parseCashFlowQuery,
  shiftCashFlowDate,
  summarizeCosts,
} from "@/lib/cash-flow"
import { mergeCashFlowSummaries, mergeGroupsByName, sumBalances } from "@/lib/cash-flow-overview"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { loadUnitCashFlow, type CashFlowUnit } from "@/lib/unit-cash-flow-store"
import { Workspace } from "@/models/Workspace"
import { CashFlowNav, periodLabel } from "@/components/cash-flow-nav"
import { OpeningBalanceCard } from "@/components/opening-balance-card"
import { CashFlowTable } from "@/components/cash-flow-table"
import { CashFlowCostsChart } from "@/components/cash-flow-costs-chart"
import { CostCumulativeChart, CostPeriodChart } from "@/components/cost-curve-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CashFlowUnitsTable } from "@/components/cash-flow-units-table"

// Caixa de todas as unidades: cada uma é calculada com as próprias regras e os valores são somados.
// Como no caixa da unidade, é sempre do ano, mês a mês, e os gastos por grupo são de um mês só.
export default async function WorkspaceCashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow">) {
  const { workspaceId } = await params
  const now = new Date()
  const search = await searchParams
  const query = { ...parseCashFlowQuery(search, now), view: "year" as const }
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace para garantir o acesso.
  const [workspace] = await Workspace.aggregate<{ id: string; units: (CashFlowUnit & { name: string })[] }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              revenueShare: { $ifNull: ["$revenueShare", null] },
              openingBalance: { $ifNull: ["$openingBalance", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, units: 1 } },
  ])
  if (!workspace) notFound()

  const today = parseCashFlowQuery({}, now).date
  const buckets = cashFlowBuckets(query)
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const costBuckets = cashFlowBuckets({ view: "month", date: costMonthDate(search.costs, shown, today) })
  const costMonth = { from: costBuckets[0].from, to: costBuckets.at(-1)!.to }
  const [icons, flows, monthFlows] = await Promise.all([
    loadExpenseGroupIcons(),
    Promise.all(workspace.units.map((unit) => loadUnitCashFlow(workspace.id, unit, buckets, today))),
    Promise.all(workspace.units.map((unit) => loadUnitCashFlow(workspace.id, unit, costBuckets, today))),
  ])
  const summary = mergeCashFlowSummaries(
    buckets,
    flows.map((flow) => flow.summary),
  )
  const balanceCents = sumBalances(flows.map((flow) => flow.balanceCents))
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const costs = summarizeCosts(
    mergeCashFlowSummaries(costBuckets, monthFlows.map((flow) => flow.summary)).total.real,
    mergeGroupsByName(monthFlows.flatMap((flow) => flow.groups)).map(({ iconId, ...group }) => ({
      ...group,
      icon: (iconId && iconsById.get(iconId)) || null,
    })),
  )
  const curve = costCurve(
    flows.map((flow) => ({ buckets: flow.summary.buckets, monthlyBudgetCents: flow.monthlyBudgetCents })),
    today,
  )
  const units = workspace.units.map((unit, i) => ({
    id: unit.id,
    name: unit.name,
    real: flows[i].summary.total.real,
    balanceCents: flows[i].balanceCents,
  }))

  const pathname = `/workspace/${workspaceId}/cash-flow`
  // O mês dos gastos por grupo só vai para a URL depois de escolhido.
  const listQuery: Record<string, string> = search.costs
    ? { date: query.date, costs: costMonth.from.slice(0, 7) }
    : { date: query.date }
  // Setas do gráfico de gastos, dentro do ano exibido.
  function costMonthHref(steps: number) {
    const month = shiftCashFlowDate({ view: "month", date: costMonth.from }, steps)
    if (month < shown.from || month > shown.to) return null
    return `${pathname}?${new URLSearchParams({ date: query.date, costs: month.slice(0, 7) })}`
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Caixa</h2>
      <OpeningBalanceCard openingBalance={null} balanceCents={balanceCents} />
      <CashFlowNav
        query={query}
        range={shown}
        isCurrent={shown.from <= today && today <= shown.to}
        today={today}
        pathname={pathname}
        views={["year"]}
      />
      <CashFlowTable
        view={query.view}
        summary={summary}
        hasPartnerShare={workspace.units.some((unit) => unit.revenueShare)}
        hasCommission={flows.some((flow) => flow.hasCommission)}
        hasSalary={flows.some((flow) => flow.hasSalary)}
        hasExpenses={flows.some((flow) => flow.hasExpenses)}
        today={today}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Custo fixo</CardTitle>
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
      {costs.rows.length > 0 && (
        <CashFlowCostsChart
          rows={costs.rows}
          totalCents={costs.totalCents}
          period={periodLabel({ view: "month", date: costMonth.from }, costMonth)}
          months={{ previousHref: costMonthHref(-1), nextHref: costMonthHref(1) }}
        />
      )}
      <h4 className="mt-4 font-semibold tracking-tight">Por unidade</h4>
      <CashFlowUnitsTable
        units={units}
        total={{ real: summary.total.real, balanceCents }}
        query={listQuery}
        workspaceId={workspaceId}
      />
    </div>
  )
}
