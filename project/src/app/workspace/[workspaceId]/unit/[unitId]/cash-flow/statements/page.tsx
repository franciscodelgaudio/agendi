import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
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
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Receivable } from "@/models/Receivable"
import { Statement } from "@/models/Statement"

export default async function UnitStatementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/statements">) {
  const { workspaceId, unitId } = await params
  const page = parseListPage(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet, partner } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />
  if (!partner) redirect(`/workspace/${workspaceId}/unit/${unitId}/cash-flow`)

  const canManage = can(data.actor, "cash_flow.manage")
  const [[result = { rows: [], total: 0 }], days, periods] = await Promise.all([
    Statement.aggregate<StatementListPage>(statementListPipeline({ partnerId: partner.id }, page)),
    canManage ? Receivable.aggregate<PendingDay>(pendingByDayPipeline(wallet.id, unitId)) : [],
    findPartnerPeriods(canManage ? [partner.id] : []),
  ])

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/statements`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <UnitCashFlowShell
      workspaceId={workspaceId}
      unitId={unitId}
      data={data}
      actions={
        canManage && (
          <CloseStatementSheet
            workspaceId={workspaceId}
            partners={[{ ...partner, unitId, periods: periods[partner.id] ?? [] }]}
            days={days}
          />
        )
      }
    >
      <StatementTable workspaceId={workspaceId} statements={result.rows} showPartner={false} canManage={canManage} />
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
