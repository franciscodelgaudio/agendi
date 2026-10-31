import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { ChevronLeftIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  type TransactionListPage,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import Link from "@/components/shared/link"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListTotals } from "@/components/shared/list-totals"
import { QuerySelect } from "@/components/shared/query-select"
import { CreateTransactionSheet } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { TransactionTable } from "@/components/workspace/[workspaceId]/cash-flow/transaction-table"
import { Button } from "@/components/ui/button"
import { Transaction } from "@/models/Transaction"
import { Wallet } from "@/models/Wallet"

export default async function WalletPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]">) {
  const { workspaceId, walletId } = await params
  const query = parseTransactionListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  if (!isObjectIdOrHexString(walletId)) notFound()

  const [[wallet], [result]] = await Promise.all([
    Wallet.aggregate<WalletListItem>([
      { $match: { _id: new Types.ObjectId(walletId) } },
      ...walletListPipeline(workspaceId),
    ]),
    Transaction.aggregate<TransactionListPage>(transactionListPipeline(walletId, query)),
  ])
  if (!wallet) notFound()

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}`
  const listQuery = { q: query.q, type: query.type, status: query.status, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / TRANSACTION_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }
  const canManage = can(actor, "cash_flow.manage")

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" nativeButton={false} aria-label="Voltar ao caixa" render={<Link href={`/workspace/${workspaceId}/cash-flow`} />}>
            <ChevronLeftIcon />
          </Button>
          <h2 className="truncate text-2xl font-semibold tracking-tight">{wallet.name}</h2>
        </div>
        {canManage && <CreateTransactionSheet workspaceId={workspaceId} walletId={walletId} />}
      </div>
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
        <QuerySelect
          query={listQuery}
          field="status"
          label="Situação"
          items={[
            { value: "all", label: "Pagas e pendentes" },
            { value: "paid", label: "Pagas" },
            { value: "pending", label: "Pendentes" },
          ]}
        />
        <ListTotals
          items={[
            { label: "Entradas", cents: wallet.incomingCents },
            { label: "Saídas", cents: wallet.expenseCents },
            { label: "Saldo", cents: wallet.balanceCents },
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
    </div>
  )
}
