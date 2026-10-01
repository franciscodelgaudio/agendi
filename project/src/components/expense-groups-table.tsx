import type { ExpenseGroupInfo, ExpenseGroupSummary } from "@/lib/expense"
import type { ExpenseGroupIcon } from "@/lib/expense-group-icon"
import type { GroupSortField } from "@/lib/cash-flow-list"
import type { SortDir } from "@/lib/unit-list"
import { ExpenseGroupIconBadge } from "@/components/expense-group-icon"
import { ExpenseGroupActions, type LimitMonths } from "@/components/expense-group-sheets"
import { currencyFormat } from "@/components/service-format"
import { SortableHead } from "@/components/sortable-head"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

type Props = {
  // Grupos automáticos (equipe e repasse) não são editados nem excluídos. limits: o limite em
  // cada mês de limitMonths, para a edição.
  groups: ExpenseGroupSummary<
    ExpenseGroupInfo & { icon: ExpenseGroupIcon | null; automatic?: boolean; limits: (number | null)[] }
  >[]
  icons: ExpenseGroupIcon[]
  limitMonths: LimitMonths
  // Busca, filtro e ordenação atuais, preservados nos links de ordenação.
  query: { q: string; sort: GroupSortField; dir: SortDir } & Record<string, string>
  pathname: string
  workspaceId: string
  unitId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
  limitLabel: string
}

// Gasto do período por grupo: o lançado (pago ou não) comparado ao limite do período.
export function ExpenseGroupsTable({
  groups,
  icons,
  limitMonths,
  query,
  pathname,
  workspaceId,
  unitId,
  canManage,
  limitLabel,
}: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead field="name" label="Grupo" query={query} pathname={pathname} className="w-full" />
            <SortableHead field="total" label="Lançado" query={query} pathname={pathname} className="text-right" />
            <SortableHead
              field="paid"
              label="Pago"
              query={query}
              pathname={pathname}
              className="text-right @max-md:hidden"
            />
            <TableHead className="min-w-40 px-4 @max-lg:hidden">{limitLabel}</TableHead>
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum grupo encontrado.
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="max-w-0 px-4 font-medium">
                <div className="flex items-center gap-2">
                  <ExpenseGroupIconBadge icon={group.icon} />
                  <span className="truncate">{group.name}</span>
                </div>
              </TableCell>
              <TableCell className={cn("px-4 text-right tabular-nums", group.overLimit && "text-destructive")}>
                {money(group.totalCents)}
              </TableCell>
              <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-md:hidden">
                {money(group.paidCents)}
              </TableCell>
              <TableCell className="px-4 @max-lg:hidden">
                {group.limitCents === null ? (
                  <span className="text-muted-foreground">Sem limite</span>
                ) : (
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {money(group.limitCents)}
                      {group.overLimit && (
                        <span className="text-destructive">
                          {" "}
                          · {money(group.totalCents - group.limitCents)} acima
                        </span>
                      )}
                    </span>
                    <div className="h-1.5 overflow-hidden bg-muted">
                      <div
                        className={cn("h-full", group.overLimit ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${Math.min(group.totalCents / group.limitCents, 1) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="px-4 text-right">
                  {!group.automatic && (
                    <ExpenseGroupActions
                      workspaceId={workspaceId}
                      unitId={unitId}
                      icons={icons}
                      limitMonths={limitMonths}
                      group={group}
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
