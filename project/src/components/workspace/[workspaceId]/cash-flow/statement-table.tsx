import { currencyFormat } from "@/components/shared/service-format"
import { StatementActions } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StatementListItem } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

function statementPeriod({ from, to }: Pick<StatementListItem, "from" | "to">) {
  if (!from || !to) return "—"
  const first = dayFormat.format(new Date(from))
  const last = dayFormat.format(new Date(to))
  return first === last ? first : `${first} – ${last}`
}

type Props = {
  workspaceId: string
  statements: StatementListItem[]
  showUnit: boolean
  canManage: boolean
}

export function StatementTable({ workspaceId, statements, showUnit, canManage }: Props) {
  const columns = 6 + Number(showUnit) + Number(canManage)

  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Fechamento</TableHead>
            {showUnit && <TableHead className="px-4 @max-3xl:hidden">Unidade</TableHead>}
            <TableHead className="px-4 @max-2xl:hidden">Período</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Bruto</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Repasse</TableHead>
            <TableHead className="px-4 text-right">Líquido</TableHead>
            <TableHead className="px-4 @max-md:hidden">Situação</TableHead>
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum fechamento ainda.
              </TableCell>
            </TableRow>
          )}
          {statements.map((statement) => (
            <TableRow key={statement.id}>
              <TableCell className="max-w-0 px-4">
                <span className="block truncate font-medium">{statement.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {statement.count} {statement.count === 1 ? "recebível" : "recebíveis"} · fechado em{" "}
                  {dayFormat.format(new Date(statement.closedAt))}
                </span>
              </TableCell>
              {showUnit && (
                <TableCell className="px-4 whitespace-nowrap @max-3xl:hidden">
                  {statement.unitName ?? <span className="text-muted-foreground">Todas as unidades</span>}
                </TableCell>
              )}
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
  )
}
