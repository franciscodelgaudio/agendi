import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadWalletCashFlow } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/wallet-page-store"
import {
  parseListPage,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
  type StatementListPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { StatementTable } from "@/components/workspace/[workspaceId]/cash-flow/statement-table"
import { WalletShell } from "@/components/workspace/[workspaceId]/cash-flow/wallet-shell"
import { Statement } from "@/models/Statement"

export default async function WalletStatementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]/statements">) {
  const { workspaceId, walletId } = await params
  const page = parseListPage(await searchParams)
  const { actor, wallet } = await loadWalletCashFlow(workspaceId, walletId)
  const [result = { rows: [], total: 0 }] = await Statement.aggregate<StatementListPage>(
    statementListPipeline(walletId, null, page),
  )

  const pathname = `/workspace/${workspaceId}/cash-flow/wallets/${walletId}/statements`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <WalletShell workspaceId={workspaceId} wallet={wallet}>
      <StatementTable
        workspaceId={workspaceId}
        statements={result.rows}
        showUnit
        canManage={can(actor, "cash_flow.manage")}
      />
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
