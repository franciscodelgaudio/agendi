import { CheckIcon } from "lucide-react"
import { money } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { StatementActions } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { ExportMenu } from "@/components/shared/export-menu"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StatementListItem } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { netCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"

function ReconcileBadge({ diffCents }: { diffCents: number }) {
  if (diffCents === 0) {
    return (
      <Badge variant="secondary">
        <CheckIcon />
        Bateu
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
      {money(Math.abs(diffCents))} {diffCents < 0 ? "a menos" : "a mais"}
    </Badge>
  )
}

type Props = {
  workspaceId: string
  statements: StatementListItem[]
  showPartner: boolean
  canManage: boolean
}

export function StatementTable({ workspaceId, statements, showPartner, canManage }: Props) {
  const columns = 5 + Number(showPartner)

  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Repasse</TableHead>
            {showPartner && <TableHead className="px-4 @max-3xl:hidden">Parceiro</TableHead>}
            <TableHead className="px-4 text-right @max-xl:hidden">Esperado</TableHead>
            <TableHead className="px-4 text-right">Recebido</TableHead>
            <TableHead className="px-4 @max-md:hidden">Conferência</TableHead>
            <TableHead className="w-0 px-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum repasse conferido ainda.
              </TableCell>
            </TableRow>
          )}
          {statements.map((statement) => {
            const expectedCents = netCents(statement.grossCents, statement.shareBps)
            return (
              <TableRow key={statement.id}>
                <TableCell className="max-w-0 px-4">
                  <span className="block truncate font-medium">{statement.name}</span>
                </TableCell>
                {showPartner && (
                  <TableCell className="px-4 whitespace-nowrap @max-3xl:hidden">
                    {statement.partnerName ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                )}
                <TableCell className="px-4 text-right whitespace-nowrap tabular-nums @max-xl:hidden">
                  {money(expectedCents)}
                </TableCell>
                <TableCell className="px-4 text-right font-medium tabular-nums">{money(statement.totalCents)}</TableCell>
                <TableCell className="px-4 whitespace-nowrap @max-md:hidden">
                  <ReconcileBadge diffCents={statement.totalCents - expectedCents} />
                </TableCell>
                <TableCell className="px-4 text-right">
                  <div className="flex justify-end gap-1">
                    <ExportMenu
                      href={`/api/workspace/${workspaceId}/cash-flow/statements/${statement.id}/export`}
                      label={`Exportar ${statement.name}`}
                    />
                    {canManage && <StatementActions workspaceId={workspaceId} statement={statement} />}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
