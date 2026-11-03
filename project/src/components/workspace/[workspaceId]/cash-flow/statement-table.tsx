import { money, percent } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { StatementActions } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StatementListItem } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { netCents, passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

function statementPeriod({ from, to }: Pick<StatementListItem, "from" | "to">) {
  const last = dayFormat.format(new Date(to))
  if (!from) return `até ${last}`
  const first = dayFormat.format(new Date(from))
  return first === last ? first : `${first} – ${last}`
}

type Props = {
  workspaceId: string
  statements: StatementListItem[]
  showPartner: boolean
  canManage: boolean
}

export function StatementTable({ workspaceId, statements, showPartner, canManage }: Props) {
  const columns = 6 + Number(showPartner) + Number(canManage)

  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Fechamento</TableHead>
            {showPartner && <TableHead className="px-4 @max-3xl:hidden">Parceiro</TableHead>}
            <TableHead className="px-4 @max-2xl:hidden">Período</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Bruto</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Parte do parceiro</TableHead>
            <TableHead className="px-4 text-right">Você recebe</TableHead>
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
                <span className="block truncate text-xs text-muted-foreground">
                  {statement.count} {statement.count === 1 ? "atendimento" : "atendimentos"} · fechado em{" "}
                  {dayFormat.format(new Date(statement.createdAt))}
                </span>
              </TableCell>
              {showPartner && (
                <TableCell className="px-4 whitespace-nowrap @max-3xl:hidden">
                  {statement.partnerName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
              )}
              <TableCell className="px-4 whitespace-nowrap tabular-nums @max-2xl:hidden">{statementPeriod(statement)}</TableCell>
              <TableCell className="px-4 text-right tabular-nums @max-xl:hidden">{money(statement.grossCents)}</TableCell>
              <TableCell className="px-4 text-right whitespace-nowrap tabular-nums @max-xl:hidden">
                −{money(passOnCents(statement.grossCents, statement.shareBps))}
                <span className="block text-xs text-muted-foreground">{percent(statement.shareBps)}</span>
              </TableCell>
              <TableCell className="px-4 text-right font-medium tabular-nums">
                {money(statement.totalCents ?? netCents(statement.grossCents, statement.shareBps))}
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
                  <StatementActions workspaceId={workspaceId} statement={statement} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
