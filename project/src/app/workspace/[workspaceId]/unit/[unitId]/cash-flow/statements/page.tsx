import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import {
  parseListPage,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
  type StatementListPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { StatementTable } from "@/components/workspace/[workspaceId]/cash-flow/statement-table"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Statement } from "@/models/Statement"

export default async function UnitStatementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/statements">) {
  const { workspaceId, unitId } = await params
  const page = parseListPage(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const [result = { rows: [], total: 0 }] = await Statement.aggregate<StatementListPage>(
    statementListPipeline(wallet.id, unitId, page),
  )

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/statements`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data}>
      <StatementTable
        workspaceId={workspaceId}
        statements={result.rows}
        showUnit={false}
        canManage={can(data.actor, "cash_flow.manage")}
      />
      <ListPagination
        query={{}}
        page={page}
        pageSize={RECEIVABLE_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="fechamentos"
      />
    </UnitCashFlowShell>
  )
}
