import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseListPage,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  type PendingReceivablePage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListTotals } from "@/components/shared/list-totals"
import { ReceivableTable } from "@/components/workspace/[workspaceId]/cash-flow/receivable-table"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Receivable } from "@/models/Receivable"

export default async function WalletReceivablesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/receivables">) {
  const { workspaceId, walletId } = await params
  const page = parseListPage(await searchParams)
  const { actor, wallet, partners } = await loadWalletCashFlow(workspaceId, walletId)
  const canManage = can(actor, "cash_flow.manage")

  const [result = { rows: [], total: 0, totalCents: 0 }] = await Receivable.aggregate<PendingReceivablePage>(
    pendingReceivablesPipeline(walletId, null, page),
  )

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/receivables`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <WalletShell workspaceId={workspaceId} wallet={wallet} partners={partners}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {partners.length > 0
            ? "Atendimentos concluídos que ainda não foram recebidos. Os das unidades com parceiro entram no próximo fechamento."
            : "Atendimentos concluídos que ainda não foram recebidos."}
        </p>
        <ListTotals items={[{ label: "A receber", cents: result.totalCents }]} />
      </div>
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
