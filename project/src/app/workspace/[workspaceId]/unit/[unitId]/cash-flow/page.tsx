import { notFound, redirect } from "next/navigation"
import { parseCashFlowQuery, shiftCashFlowDate } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { CASH_FLOW_PAGE_SIZE, parseTherapistListQuery, therapistListPage } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import { loadCashFlowSummaryScreen } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-screen-store"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { CashFlowNav, periodLabel } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-nav"
import { ExportMenu } from "@/components/shared/export-menu"
import { OpeningBalanceCard } from "@/components/workspace/[workspaceId]/shared/cash-flow/opening-balance-card"
import { CashFlowTable } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-table"
import { CashFlowCostsChart } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-costs-chart"
import { CostCumulativeChart, CostPeriodChart } from "@/components/workspace/[workspaceId]/shared/cash-flow/cost-curve-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CashFlowTherapistsTable } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-therapists-table"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"

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
  const data = await loadCashFlowSummaryScreen(workspaceId, user.id, unitId, query.date, now, search.costs)
  if (!data) notFound()
  const { today, shown, revenueShare, wallet, openingBalance, balanceCents, summary, columns, costMonth, costs, curve } =
    data
  const therapists = therapistListPage(data.therapists, { ...filters, page })

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  // O mês dos gastos por grupo só vai para a URL depois de escolhido, e segue na busca e na lista.
  const listQuery = { date: query.date, costs: search.costs ? costMonth.from.slice(0, 7) : "", ...filters }
  // Página além da última (ex.: depois de trocar de período) vai para a última.
  const pages = Math.ceil(therapists.total / CASH_FLOW_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  // Setas do gráfico de gastos, dentro do ano exibido; a página da lista é mantida.
  function costMonthHref(steps: number) {
    const month = shiftCashFlowDate({ view: "month", date: costMonth.from }, steps)
    if (month < shown.from || month > shown.to) return null
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, costs: month.slice(0, 7), page: page > 1 ? String(page) : "" }).filter(
        ([, v]) => v,
      ),
    )
    return `${pathname}?${params}`
  }

  return (
    <div className="flex flex-col gap-4">
      <OpeningBalanceCard
        openingBalance={openingBalance}
        balanceCents={balanceCents}
        wallet={
          wallet && {
            name: wallet.name,
            // Só na compartilhada (sem divisão) o saldo mostrado é o da carteira toda.
            sharedWith:
              wallet.undistributedCents === null ? wallet.units.filter((u) => u.id !== unitId).map((u) => u.name) : [],
          }
        }
      />
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
      {costs.rows.length > 0 && (
        <CashFlowCostsChart
          rows={costs.rows}
          totalCents={costs.totalCents}
          period={periodLabel({ view: "month", date: costMonth.from }, costMonth)}
          months={{ previousHref: costMonthHref(-1), nextHref: costMonthHref(1) }}
        />
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold tracking-tight">Por profissional</h4>
        <ListSearch query={listQuery} placeholder="Buscar profissional..." />
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
        itemLabel="profissionais"
      />
    </div>
  )
}
