import { redirect } from "next/navigation"
import { ArrowRightIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import {
  pendingReceivablesPipeline,
  type PendingReceivablePage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  transactionTotalsPipeline,
  type TransactionListPage,
  type TransactionTotals,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import Link from "@/components/shared/link"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { QuerySelect } from "@/components/shared/query-select"
import { BalanceCard, MoneyPath, PendingCard } from "@/components/workspace/[workspaceId]/cash-flow/money-path"
import { money } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { SettleReceivableSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { CreateTransactionSheet } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { TransactionTable } from "@/components/workspace/[workspaceId]/cash-flow/transaction-table"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Button } from "@/components/ui/button"
import { Receivable } from "@/models/Receivable"
import { Transaction } from "@/models/Transaction"

const NO_TOTALS: TransactionTotals = { incomingCents: 0, expenseCents: 0, balanceCents: 0 }
const NO_PENDING: PendingReceivablePage = { rows: [], total: 0, totalCents: 0 }

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

function plural(count: number) {
  return count === 1 ? "1 atendimento" : `${count} atendimentos`
}

export default async function UnitCashFlowPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const query = parseTransactionListQuery(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet, partner } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const canManage = can(data.actor, "cash_flow.manage")
  const seesPartner = visiblePages(data.actor).workspace.includes("cash_flow")
  const [[pending = NO_PENDING], [totals = NO_TOTALS], [result]] = await Promise.all([
    Receivable.aggregate<PendingReceivablePage>(pendingReceivablesPipeline(wallet.id, unitId, 1)),
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

  const pendingCard = partner ? (
    <PendingCard
      label={`Com ${partner.name}`}
      cents={pending.totalCents}
      hint={pending.total > 0 ? `${plural(pending.total)} ainda não conferidos` : "Nada pendente de conferência."}
    >
      {seesPartner && (
        <div>
          <Button nativeButton={false} render={<Link href={`/workspace/${workspaceId}/partners/${partner.id}`} />}>
            {canManage && pending.total > 0 ? "Conferir repasse" : "Ver repasses"}
            <ArrowRightIcon />
          </Button>
        </div>
      )}
    </PendingCard>
  ) : (
    <PendingCard
      label="Pagamento a confirmar"
      cents={pending.totalCents}
      hint={pending.total > 0 ? `${plural(pending.total)} concluídos sem pagamento confirmado` : "Tudo confirmado."}
    >
      {pending.rows.length > 0 && (
        <ul className="divide-y border bg-background text-sm text-foreground">
          {pending.rows.map((receivable) => (
            <li key={receivable.id} className="flex items-center gap-3 px-3 py-2">
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{receivable.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{dayFormat.format(new Date(receivable.accruedAt))}</span>
              </span>
              <span className="tabular-nums">{money(receivable.valueCents)}</span>
              {canManage && <SettleReceivableSheet workspaceId={workspaceId} receivable={receivable} />}
            </li>
          ))}
          {pending.total > pending.rows.length && (
            <li className="px-3 py-2 text-muted-foreground">e mais {plural(pending.total - pending.rows.length)}</li>
          )}
        </ul>
      )}
    </PendingCard>
  )

  return (
    <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data}>
      <MoneyPath
        pending={pendingCard}
        balance={<BalanceCard label={`Na carteira ${wallet.name}`} cents={totals.balanceCents} hint="Entradas e saídas desta unidade" />}
      />

      <section aria-labelledby="extract-title" className="flex flex-col gap-3">
        <h4 id="extract-title" className="font-semibold">
          Extrato
        </h4>
        <ListToolbar actions={canManage && <CreateTransactionSheet workspaceId={workspaceId} unitId={unitId} />}>
          <ListSearch query={listQuery} placeholder="Buscar no extrato..." />
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
        </ListToolbar>
        <TransactionTable workspaceId={workspaceId} transactions={result.rows} query={listQuery} pathname={pathname} canManage={canManage} />
        <ListPagination
          query={listQuery}
          page={query.page}
          pageSize={TRANSACTION_PAGE_SIZE}
          total={result.total}
          pathname={pathname}
          itemLabel="lançamentos"
        />
      </section>
    </UnitCashFlowShell>
  )
}
