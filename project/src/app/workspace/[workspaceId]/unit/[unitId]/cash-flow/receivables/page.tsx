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
import { currencyFormat } from "@/components/shared/service-format"
import { CloseStatementSheet, SettleReceivableSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/statement-sheets"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Receivable } from "@/models/Receivable"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

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
  const immediate = wallet.settlement === "immediate"
  const [result = { rows: [], total: 0, totalCents: 0 }] = await Receivable.aggregate<PendingReceivablePage>(
    pendingReceivablesPipeline(wallet.id, unitId, page),
  )

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/receivables`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)
  const showActions = canManage && immediate

  return (
    <UnitCashFlowShell
      workspaceId={workspaceId}
      unitId={unitId}
      data={data}
      actions={
        canManage && (
          <CloseStatementSheet
            workspaceId={workspaceId}
            unitId={unitId}
            pendingCount={result.total}
            pendingCents={result.totalCents}
            primary={!immediate}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Atendimentos concluídos que ainda não entraram num fechamento.
        </p>
        <ListTotals items={[{ label: "A receber", cents: result.totalCents }]} />
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full px-4">Descrição</TableHead>
              <TableHead className="px-4 @max-md:hidden">Data</TableHead>
              <TableHead className="px-4 text-right">Valor</TableHead>
              {showActions && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 4 : 3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum recebível pendente.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((receivable) => (
              <TableRow key={receivable.id}>
                <TableCell className="max-w-0 px-4 font-medium">
                  <span className="block truncate">{receivable.name}</span>
                </TableCell>
                <TableCell className="px-4 tabular-nums @max-md:hidden">
                  {dayFormat.format(new Date(receivable.accruedAt))}
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">
                  {currencyFormat.format(receivable.valueCents / 100)}
                </TableCell>
                {showActions && (
                  <TableCell className="px-4 text-right">
                    <SettleReceivableSheet workspaceId={workspaceId} receivable={receivable} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
