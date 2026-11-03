import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  transactionTotalsPipeline,
  type TransactionListPage,
  type TransactionTotals,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListTotals } from "@/components/shared/list-totals"
import { QuerySelect } from "@/components/shared/query-select"
import { CreateTransactionSheet } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { TransactionTable } from "@/components/workspace/[workspaceId]/cash-flow/transaction-table"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Transaction } from "@/models/Transaction"

const NO_TOTALS: TransactionTotals = { incomingCents: 0, expenseCents: 0, balanceCents: 0 }

export default async function UnitCashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const query = parseTransactionListQuery(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const canManage = can(data.actor, "cash_flow.manage")
  const [[totals = NO_TOTALS], [result]] = await Promise.all([
    Transaction.aggregate<TransactionTotals>(transactionTotalsPipeline(wallet.id, unitId)),
    Transaction.aggregate<TransactionListPage>(transactionListPipeline(wallet.id, query, unitId)),
  ])

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const listQuery = { q: query.q, type: query.type, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / TRANSACTION_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }

  return (
    <UnitCashFlowShell
      workspaceId={workspaceId}
      unitId={unitId}
      data={data}
      actions={canManage && <CreateTransactionSheet workspaceId={workspaceId} unitId={unitId} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar transação..." />
        <QuerySelect
          query={listQuery}
          field="type"
          label="Tipo"
          items={[
            { value: "all", label: "Entradas e saídas" },
            { value: "incoming", label: "Entradas" },
            { value: "expense", label: "Saídas" },
          ]}
        />
        <ListTotals
          items={[
            { label: "Entradas", cents: totals.incomingCents },
            { label: "Saídas", cents: totals.expenseCents },
            { label: "Saldo", cents: totals.balanceCents },
          ]}
        />
      </div>
      <TransactionTable
        workspaceId={workspaceId}
        transactions={result.rows}
        query={listQuery}
        pathname={pathname}
        canManage={canManage}
      />
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={TRANSACTION_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="transações"
      />
    </UnitCashFlowShell>
  )
}
