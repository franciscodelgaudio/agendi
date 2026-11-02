import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseListPage,
  pendingByUnitPipeline,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  type PendingByUnit,
  type PendingReceivablePage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListTotals } from "@/components/shared/list-totals"
import { ReceivableTable } from "@/components/workspace/[workspaceId]/cash-flow/receivable-table"
import { CloseStatementSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Receivable } from "@/models/Receivable"

export default async function WalletReceivablesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/receivables">) {
  const { workspaceId, walletId } = await params
  const page = parseListPage(await searchParams)
  const { actor, wallet } = await loadWalletCashFlow(workspaceId, walletId)
  const canManage = can(actor, "cash_flow.manage")
  const immediate = wallet.settlement === "immediate"

  const [[result = { rows: [], total: 0, totalCents: 0 }], units] = await Promise.all([
    Receivable.aggregate<PendingReceivablePage>(pendingReceivablesPipeline(walletId, null, page)),
    canManage ? Receivable.aggregate<PendingByUnit>(pendingByUnitPipeline(walletId)) : [],
  ])

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/receivables`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <WalletShell
      workspaceId={workspaceId}
      wallet={wallet}
      actions={
        canManage && (
          <CloseStatementSheet workspaceId={workspaceId} target={{ kind: "wallet", walletId, units }} primary={!immediate} />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Atendimentos concluídos que ainda não entraram num fechamento.</p>
        <ListTotals items={[{ label: "A receber", cents: result.totalCents }]} />
      </div>
      <ReceivableTable workspaceId={workspaceId} receivables={result.rows} showUnit canSettle={canManage && immediate} />
      <ListPagination
        query={{}}
        page={page}
        pageSize={RECEIVABLE_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="recebíveis"
      />
    </WalletShell>
  )
}
