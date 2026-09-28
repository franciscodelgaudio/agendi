import { notFound, redirect } from "next/navigation"
import { parseCashFlowQuery } from "@/lib/cash-flow"
import { CASH_FLOW_PAGE_SIZE, parseTherapistListQuery, therapistListPage } from "@/lib/cash-flow-list"
import { loadCashFlowSummaryScreen } from "@/lib/cash-flow-screen-store"
import { requirePage } from "@/lib/page-guard"
import { requireUser } from "@/lib/session"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { ExportMenu } from "@/components/export-menu"
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
  // O caixa é sempre do ano, mês a mês.
  const query = { ...parseCashFlowQuery(search, now), view: "year" as const }
  // Busca e ordenação mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = parseTherapistListQuery(search)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const data = await loadCashFlowSummaryScreen(workspaceId, user.id, unitId, query.date, now)
  if (!data) notFound()
  const { today, shown, revenueShare, openingBalance, balanceCents, summary, columns, costs, curve } = data
  const therapists = therapistListPage(data.therapists, { ...filters, page })

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const listQuery = { date: query.date, ...filters }
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <CashFlowNav
            query={query}
            range={shown}
            isCurrent={shown.from <= today && today <= shown.to}
            today={today}
            pathname={pathname}
            views={["year"]}
            preserve={filters}
          />
        </div>
        <ExportMenu href={`/api${pathname}/export`} query={listQuery} />
      </div>
      <CashFlowTable
        view={query.view}
        summary={summary}
        hasPartnerShare={!!revenueShare}
        hasCommission={columns.commission}
        hasSalary={columns.salary}
        hasExpenses={columns.expenses}
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
