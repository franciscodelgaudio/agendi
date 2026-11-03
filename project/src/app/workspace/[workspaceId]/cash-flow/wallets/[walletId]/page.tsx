import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseListPage,
  pendingByDayPipeline,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  type PendingDay,
  type PendingReceivablePage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { findPartnerPeriods } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { ListTotals } from "@/components/shared/list-totals"
import { ReceivableTable } from "@/components/workspace/[workspaceId]/cash-flow/receivable-table"
import { ReconcileStatementSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Receivable } from "@/models/Receivable"

export default async function WalletReceivablesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]">) {
  const { workspaceId, walletId } = await params
  const page = parseListPage(await searchParams)
  const { actor, wallet, partners } = await loadWalletCashFlow(workspaceId, walletId)
  const canManage = can(actor, "cash_flow.manage")

  const closes = canManage && partners.length > 0
  const [[result = { rows: [], total: 0, totalCents: 0 }], days, periods] = await Promise.all([
    Receivable.aggregate<PendingReceivablePage>(pendingReceivablesPipeline(walletId, null, page)),
    closes ? Receivable.aggregate<PendingDay>(pendingByDayPipeline(walletId, null)) : [],
    findPartnerPeriods(closes ? partners.map((partner) => partner.id) : []),
  ])

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <WalletShell
      workspaceId={workspaceId}
      wallet={wallet}
      partners={partners}
    >
      <ListToolbar
        actions={
          closes && (
            <ReconcileStatementSheet
              workspaceId={workspaceId}
              partners={partners.map((partner) => ({ ...partner, periods: periods[partner.id] ?? [] }))}
              days={days}
            />
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {partners.length > 0
            ? "Atendimentos concluídos que ainda não foram recebidos. Os das unidades com parceiro entram no próximo repasse."
            : "Atendimentos concluídos que ainda não foram recebidos."}
        </p>
        <ListTotals items={[{ label: "A receber", cents: result.totalCents }]} />
      </ListToolbar>
      <ReceivableTable workspaceId={workspaceId} receivables={result.rows} showUnit canSettle={canManage && partners.length === 0} />
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
