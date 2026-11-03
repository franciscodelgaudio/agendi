import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import {
  parseListPage,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  type PendingReceivablePage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListTotals } from "@/components/shared/list-totals"
import { ReceivableTable } from "@/components/workspace/[workspaceId]/cash-flow/receivable-table"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Receivable } from "@/models/Receivable"

export default async function UnitReceivablesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivables">) {
  const { workspaceId, unitId } = await params
  const page = parseListPage(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const canManage = can(data.actor, "cash_flow.manage")
  const { partner } = data
  const [result = { rows: [], total: 0, totalCents: 0 }] = await Receivable.aggregate<PendingReceivablePage>(
    pendingReceivablesPipeline(wallet.id, unitId, page),
  )

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/receivables`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data}>
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
