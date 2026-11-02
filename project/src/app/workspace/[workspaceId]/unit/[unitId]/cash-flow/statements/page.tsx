import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import {
  parseListPage,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
  type StatementListPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import { ListPagination } from "@/components/shared/list-pagination"
import { currencyFormat } from "@/components/shared/service-format"
import { StatementActions, statementPeriod } from "@/components/workspace/[workspaceId]/unit/[unitId]/statement-sheets"
import { UnitCashFlowShell } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-cash-flow-shell"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Statement } from "@/models/Statement"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

export default async function UnitStatementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/statements">) {
  const { workspaceId, unitId } = await params
  const page = parseListPage(await searchParams)
  const data = await loadUnitCashFlow(workspaceId, unitId)
  const { wallet } = data
  if (!wallet) return <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data} />

  const canManage = can(data.actor, "cash_flow.manage")
  const [result = { rows: [], total: 0 }] = await Statement.aggregate<StatementListPage>(
    statementListPipeline(wallet.id, unitId, page),
  )

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/statements`
  const pages = Math.ceil(result.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) redirect(`${pathname}?page=${pages}`)

  return (
    <UnitCashFlowShell workspaceId={workspaceId} unitId={unitId} data={data}>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full px-4">Fechamento</TableHead>
              <TableHead className="px-4 @max-2xl:hidden">Período</TableHead>
              <TableHead className="px-4 text-right @max-xl:hidden">Bruto</TableHead>
              <TableHead className="px-4 text-right @max-xl:hidden">Repasse</TableHead>
              <TableHead className="px-4 text-right">Líquido</TableHead>
              <TableHead className="px-4 @max-md:hidden">Situação</TableHead>
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum fechamento ainda.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((statement) => (
              <TableRow key={statement.id}>
                <TableCell className="max-w-0 px-4">
                  <span className="block truncate font-medium">{statement.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {statement.count} {statement.count === 1 ? "recebível" : "recebíveis"} · fechado em{" "}
                    {dayFormat.format(new Date(statement.closedAt))}
                  </span>
                </TableCell>
                <TableCell className="px-4 whitespace-nowrap tabular-nums @max-2xl:hidden">{statementPeriod(statement)}</TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-xl:hidden">{money(statement.grossCents)}</TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-xl:hidden">
                  {percentFormat.format(statement.passOnBps / 100)}%
                </TableCell>
                <TableCell className="px-4 text-right font-medium tabular-nums">
                  {money(statement.totalCents ?? passOnCents(statement.grossCents, statement.passOnBps))}
                </TableCell>
                <TableCell className="px-4 whitespace-nowrap @max-md:hidden">
                  {statement.paidAt ? (
                    <Badge variant="secondary">Pago em {dayFormat.format(new Date(statement.paidAt))}</Badge>
                  ) : (
                    <Badge variant="outline">Aguardando pagamento</Badge>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    {!statement.paidAt && <StatementActions workspaceId={workspaceId} statement={statement} />}
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
        itemLabel="fechamentos"
      />
    </UnitCashFlowShell>
  )
}
