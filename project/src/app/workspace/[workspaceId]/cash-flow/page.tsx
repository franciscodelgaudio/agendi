import { notFound } from "next/navigation"
import { cashFlowBuckets, costMonthDate, parseCashFlowQuery, shiftCashFlowDate, summarizeCosts } from "@/lib/cash-flow"
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
import { CashFlowUnitsTable } from "@/components/cash-flow-units-table"

// Caixa de todas as unidades: cada uma é calculada com as próprias regras e os valores são somados.
export default async function WorkspaceCashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow">) {
  const { workspaceId } = await params
  const now = new Date()
  const search = await searchParams
  const query = parseCashFlowQuery(search, now)
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
  // No ano, os gastos por grupo são de um mês só, como no caixa da unidade.
  const costBuckets =
    query.view === "year" ? cashFlowBuckets({ view: "month", date: costMonthDate(search.costs, shown, today) }) : null
  const costMonth = costBuckets && { from: costBuckets[0].from, to: costBuckets.at(-1)!.to }
  const [icons, flows, monthFlows] = await Promise.all([
    loadExpenseGroupIcons(),
    Promise.all(workspace.units.map((unit) => loadUnitCashFlow(workspace.id, unit, buckets, today))),
    costBuckets ? Promise.all(workspace.units.map((unit) => loadUnitCashFlow(workspace.id, unit, costBuckets, today))) : null,
  ])
  const summary = mergeCashFlowSummaries(
    buckets,
    flows.map((flow) => flow.summary),
  )
  const balanceCents = sumBalances(flows.map((flow) => flow.balanceCents))
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const costFlows = monthFlows ?? flows
  const costs = summarizeCosts(
    costBuckets ? mergeCashFlowSummaries(costBuckets, costFlows.map((flow) => flow.summary)).total.real : summary.total.real,
    mergeGroupsByName(costFlows.flatMap((flow) => flow.groups)).map(({ iconId, ...group }) => ({
      ...group,
      icon: (iconId && iconsById.get(iconId)) || null,
    })),
  )
  const units = workspace.units.map((unit, i) => ({
    id: unit.id,
    name: unit.name,
    real: flows[i].summary.total.real,
    balanceCents: flows[i].balanceCents,
  }))

  const pathname = `/workspace/${workspaceId}/cash-flow`
  // Setas do gráfico de gastos, dentro do ano exibido.
  function costMonthHref(steps: number) {
    const month = shiftCashFlowDate({ view: "month", date: costMonth!.from }, steps)
    if (month < shown.from || month > shown.to) return null
    return `${pathname}?${new URLSearchParams({ view: query.view, date: query.date, costs: month.slice(0, 7) })}`
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
      {costs.rows.length > 0 && (
        <CashFlowCostsChart
          rows={costs.rows}
          totalCents={costs.totalCents}
          period={costMonth ? periodLabel({ view: "month", date: costMonth.from }, costMonth) : periodLabel(query, shown)}
          months={costMonth ? { previousHref: costMonthHref(-1), nextHref: costMonthHref(1) } : undefined}
        />
      )}
      <h4 className="mt-4 font-semibold tracking-tight">Por unidade</h4>
      <CashFlowUnitsTable
        units={units}
        total={{ real: summary.total.real, balanceCents }}
        query={{ view: query.view, date: query.date }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
