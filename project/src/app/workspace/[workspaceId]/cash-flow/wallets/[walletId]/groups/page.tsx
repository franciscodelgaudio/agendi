import { notFound, redirect } from "next/navigation"
import { FolderIcon } from "lucide-react"
import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { CASH_FLOW_PAGE_SIZE, expenseGroupListPage, parseExpenseGroupListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import { loadWalletGroupsScreen } from "@/service/workspace/[workspaceId]/cash-flow/wallet-screen-store"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { GroupLimitFilter } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-filters"
import { CashFlowNav } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-nav"
import { CreateExpenseGroupSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-sheets"
import { ExpenseGroupsTable } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-groups-table"
import { ExpenseGroupsYearTable } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-groups-year-table"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListTotals } from "@/components/shared/list-totals"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Planejamento da carteira: grupos e limites em conjunto das unidades dela.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function WalletGroupsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/groups">) {
  const { workspaceId, walletId } = await params
  const now = new Date()
  // O limite é de cada mês: no ano, soma os 12. A visão semanal não se aplica aos grupos.
  const search = await searchParams
  const parsed = parseCashFlowQuery(search, now)
  const query = { ...parsed, view: parsed.view === "year" ? ("year" as const) : ("month" as const) }
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = parseExpenseGroupListQuery(search)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const data = await loadWalletGroupsScreen(workspaceId, user.id, walletId, query, now)
  if (!data) notFound()
  const { period, icons, summary, limitMonths, overview } = data
  const canManage = can(data.actor, "cash_flow.manage")
  const today = parseCashFlowQuery({}, now).date
  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/groups`
  const listQuery = { view: query.view, date: query.date, ...filters }
  const result = expenseGroupListPage(summary, { ...filters, page })
  // Página além da última (ex.: depois de excluir o último grupo dela) vai para a última.
  const pages = Math.ceil(result.total / CASH_FLOW_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }
  const owner = { walletId }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CashFlowNav
          query={query}
          range={period}
          isCurrent={period.from <= today && today <= period.to}
          today={today}
          pathname={pathname}
          views={["month", "year"]}
          preserve={filters}
        />
        {summary.length > 0 && canManage && (
          <CreateExpenseGroupSheet workspaceId={workspaceId} owner={owner} icons={icons} limitMonths={limitMonths} />
        )}
      </div>
      {summary.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum grupo de despesas</EmptyTitle>
            <EmptyDescription>
              Os grupos da carteira planejam os gastos que as unidades dela fazem em conjunto.
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreateExpenseGroupSheet workspaceId={workspaceId} owner={owner} icons={icons} limitMonths={limitMonths} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={listQuery} placeholder="Buscar grupo..." />
            <GroupLimitFilter query={listQuery} />
            <ListTotals
              items={[
                { label: "Pago", cents: result.sums.paidCents },
                { label: "Lançado", cents: result.sums.totalCents },
                { label: "Planejado", cents: result.sums.limitCents },
              ]}
            />
          </div>
          <ExpenseGroupsTable
            groups={result.rows}
            icons={icons}
            limitMonths={limitMonths}
            query={listQuery}
            pathname={pathname}
            workspaceId={workspaceId}
            owner={owner}
            canManage={canManage}
            limitLabel={query.view === "year" ? "Limite no ano" : "Limite por mês"}
          />
          <ListPagination
            query={listQuery}
            page={page}
            pageSize={CASH_FLOW_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="grupos"
          />
          {overview && overview.groups.length > 0 && (
            <>
              <h4 className="mt-4 font-semibold tracking-tight">Mês a mês</h4>
              <ExpenseGroupsYearTable overview={overview} editing={canManage ? { workspaceId, owner } : null} />
            </>
          )}
        </>
      )}
    </div>
  )
}
