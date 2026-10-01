import { notFound, redirect } from "next/navigation"
import { FolderIcon, ReceiptIcon } from "lucide-react"
import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { CASH_FLOW_PAGE_SIZE, expenseListPage, parseExpenseListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import { loadExpensesScreen } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-screen-store"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import Link from "@/components/shared/link"
import { ExpenseGroupFilter, ExpenseStatusFilter } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-filters"
import { CashFlowNav } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-nav"
import { CreateExpenseSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense-sheets"
import { ExportMenu } from "@/components/shared/export-menu"
import { ExpensesTable } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expenses-table"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListTotals } from "@/components/shared/list-totals"
import { ListSearch } from "@/components/shared/list-search"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ExpensesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  const search = await searchParams
  const query = { ...parseCashFlowQuery(search, now), view: "month" as const }
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = parseExpenseListQuery(search)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const data = await loadExpensesScreen(workspaceId, user.id, unitId, query)
  if (!data) notFound()
  const { month, groups, expenses } = data
  const canManage = can(data.actor, "cash_flow.manage")
  const today = parseCashFlowQuery({}, now).date
  const isCurrent = month.from <= today && today <= month.to
  const base = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const pathname = `${base}/expenses`
  const listQuery = { date: query.date, ...filters }
  const result = expenseListPage(expenses, { ...filters, page }, groups)
  // Página além da última (ex.: depois de excluir a última despesa dela) vai para a última.
  const pages = Math.ceil(result.total / CASH_FLOW_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }
  const create = canManage && groups.length > 0 && (
    <CreateExpenseSheet
      workspaceId={workspaceId}
      unitId={unitId}
      groups={groups}
      defaultDate={isCurrent ? today : month.from}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CashFlowNav
          query={query}
          range={month}
          isCurrent={isCurrent}
          today={today}
          pathname={pathname}
          views={["month"]}
          preserve={filters}
        />
        {expenses.length > 0 && (
          <div className="flex items-center gap-2">
            <ExportMenu href={`/api${pathname}/export`} query={listQuery} />
            {create}
          </div>
        )}
      </div>
      {groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>Cadastre um grupo antes de lançar despesas</EmptyTitle>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href={`${base}/groups`} />}>
                Ir para planejamento
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : expenses.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma despesa neste mês</EmptyTitle>
          </EmptyHeader>
          {create && <EmptyContent>{create}</EmptyContent>}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={listQuery} placeholder="Buscar descrição..." />
            <ExpenseGroupFilter query={listQuery} groups={groups} />
            <ExpenseStatusFilter query={listQuery} />
            <ListTotals
              items={[
                { label: "Pago", cents: result.paidCents },
                { label: "Pendente", cents: result.totalCents - result.paidCents },
                { label: "Total", cents: result.totalCents },
              ]}
            />
          </div>
          <ExpensesTable
            expenses={result.rows}
            query={listQuery}
            pathname={pathname}
            groups={groups}
            workspaceId={workspaceId}
            unitId={unitId}
            canManage={canManage}
          />
          <ListPagination
            query={listQuery}
            page={page}
            pageSize={CASH_FLOW_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="despesas"
          />
        </>
      )}
    </div>
  )
}
