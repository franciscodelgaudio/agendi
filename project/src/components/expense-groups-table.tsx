import type { ExpenseGroupSummary } from "@/lib/expense"
import { ExpenseGroupActions } from "@/components/expense-group-sheets"
import { currencyFormat } from "@/components/service-format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

type Props = {
  groups: ExpenseGroupSummary[]
  workspaceId: string
  unitId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
}

// Gasto do mês por grupo: o lançado (pago ou não) comparado ao limite mensal.
export function ExpenseGroupsTable({ groups, workspaceId, unitId, canManage }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Grupo</TableHead>
            <TableHead className="px-4 text-right">Lançado</TableHead>
            <TableHead className="px-4 text-right @max-md:hidden">Pago</TableHead>
            <TableHead className="min-w-40 px-4 @max-lg:hidden">Limite por mês</TableHead>
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="max-w-0 truncate px-4 font-medium">{group.name}</TableCell>
              <TableCell className={cn("px-4 text-right tabular-nums", group.overLimit && "text-destructive")}>
                {money(group.totalCents)}
              </TableCell>
              <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-md:hidden">
                {money(group.paidCents)}
              </TableCell>
              <TableCell className="px-4 @max-lg:hidden">
                {group.monthlyLimitCents === null ? (
                  <span className="text-muted-foreground">Sem limite</span>
                ) : (
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {money(group.monthlyLimitCents)}
                      {group.overLimit && (
                        <span className="text-destructive">
                          {" "}
                          · {money(group.totalCents - group.monthlyLimitCents)} acima
                        </span>
                      )}
                    </span>
                    <div className="h-1.5 overflow-hidden bg-muted">
                      <div
                        className={cn("h-full", group.overLimit ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${Math.min(group.totalCents / group.monthlyLimitCents, 1) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="px-4 text-right">
                  <ExpenseGroupActions workspaceId={workspaceId} unitId={unitId} group={group} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
