import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseListPage,
  pendingByDayPipeline,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
  type PendingDay,
  type StatementListPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { findPartnerPeriods } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"
import { ListPagination } from "@/components/shared/list-pagination"
import { CloseStatementSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { StatementTable } from "@/components/workspace/[workspaceId]/cash-flow/statement-table"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Receivable } from "@/models/Receivable"
import { Statement } from "@/models/Statement"

export default async function WalletStatementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/statements">) {
  const { workspaceId, walletId } = await params
  const page = parseListPage(await searchParams)
  const { actor, wallet, partners } = await loadWalletCashFlow(workspaceId, walletId)
  const canManage = can(actor, "cash_flow.manage")
  const [[result = { rows: [], total: 0 }], days, periods] = await Promise.all([
    Statement.aggregate<StatementListPage>(statementListPipeline({ walletId }, page)),
    canManage ? Receivable.aggregate<PendingDay>(pendingByDayPipeline(walletId, null)) : [],
    findPartnerPeriods(canManage ? partners.map((partner) => partner.id) : []),
  ])

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/statements`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <WalletShell
      workspaceId={workspaceId}
      wallet={wallet}
      partners={partners}
      actions={
        canManage &&
        partners.length > 0 && (
          <CloseStatementSheet
            workspaceId={workspaceId}
            partners={partners.map((partner) => ({ ...partner, periods: periods[partner.id] ?? [] }))}
            days={days}
          />
        )
      }
    >
      <StatementTable workspaceId={workspaceId} statements={result.rows} showPartner canManage={canManage} />
      <ListPagination
        query={{}}
        page={page}
        pageSize={RECEIVABLE_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="fechamentos"
      />
    </WalletShell>
  )
}
