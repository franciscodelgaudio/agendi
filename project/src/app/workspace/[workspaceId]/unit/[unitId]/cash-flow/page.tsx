import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
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
import { ListTotals } from "@/components/shared/list-totals"
import { ReceivableTable } from "@/components/workspace/[workspaceId]/cash-flow/receivable-table"
import { CloseStatementSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Receivable } from "@/models/Receivable"

export default async function UnitReceivablesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const page = parseListPage(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const canManage = can(data.actor, "cash_flow.manage")
  const { partner } = data
  const closes = canManage && !!partner
  const [[result = { rows: [], total: 0, totalCents: 0 }], days, periods] = await Promise.all([
    Receivable.aggregate<PendingReceivablePage>(pendingReceivablesPipeline(wallet.id, unitId, page)),
    closes ? Receivable.aggregate<PendingDay>(pendingByDayPipeline(wallet.id, unitId)) : [],
    findPartnerPeriods(closes ? [partner.id] : []),
  ])

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <UnitCashFlowShell
      workspaceId={workspaceId}
      unitId={unitId}
      data={data}
      actions={
        closes && (
          <CloseStatementSheet
            workspaceId={workspaceId}
            partners={[{ ...partner, unitId, periods: periods[partner.id] ?? [] }]}
            days={days}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {partner
            ? `Atendimentos concluídos que ${partner.name} recebe dos clientes. Eles entram no próximo fechamento.`
            : "Atendimentos concluídos que ainda não foram recebidos."}
        </p>
        <ListTotals items={[{ label: "A receber", cents: result.totalCents }]} />
      </div>
      <ReceivableTable workspaceId={workspaceId} receivables={result.rows} showUnit={false} canSettle={canManage && !partner} />
      <ListPagination
        query={{}}
        page={page}
        pageSize={RECEIVABLE_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="recebíveis"
      />
    </UnitCashFlowShell>
  )
}
