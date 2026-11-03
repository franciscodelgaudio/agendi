import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  type TransactionListPage,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { ListTotals } from "@/components/shared/list-totals"
import { QuerySelect } from "@/components/shared/query-select"
import { CreateTransactionSheet } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { TransactionTable } from "@/components/workspace/[workspaceId]/cash-flow/transaction-table"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Transaction } from "@/models/Transaction"

export default async function WalletPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transactions">) {
  const { workspaceId, walletId } = await params
  const query = parseTransactionListQuery(await searchParams)
  const { actor, wallet, partners } = await loadWalletCashFlow(workspaceId, walletId)
  const [result] = await Transaction.aggregate<TransactionListPage>(transactionListPipeline(walletId, query))

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/transactions`
  const listQuery = { q: query.q, type: query.type, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / TRANSACTION_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }
  const canManage = can(actor, "cash_flow.manage")

  return (
    <WalletShell
      workspaceId={workspaceId}
      wallet={wallet}
      partners={partners}
    >
      <ListToolbar actions={canManage && <CreateTransactionSheet workspaceId={workspaceId} walletId={walletId} units={wallet.units} />}>
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
            { label: "Entradas", cents: wallet.incomingCents },
            { label: "Saídas", cents: wallet.expenseCents },
            { label: "Saldo", cents: wallet.balanceCents },
          ]}
        />
      </ListToolbar>
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
    </WalletShell>
  )
}
