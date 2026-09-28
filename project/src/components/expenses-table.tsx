import { ExpenseActions, ExpensePaidToggle, type ExpenseGroupOption, type ExpenseRow } from "@/components/expense-sheets"
import { ExpenseGroupIconBadge } from "@/components/expense-group-icon"
import { currencyFormat } from "@/components/service-format"
import { SortableHead } from "@/components/sortable-head"
import type { ExpenseSortField } from "@/lib/cash-flow-list"
import type { SortDir } from "@/lib/unit-list"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// As datas são dias do calendário, então são formatadas em UTC para não deslocar.
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

type Props = {
  // Só a página exibida.
  expenses: ExpenseRow[]
  // Busca, filtros e ordenação atuais, preservados nos links de ordenação.
  query: { q: string; sort: ExpenseSortField; dir: SortDir } & Record<string, string>
  pathname: string
  groups: ExpenseGroupOption[]
  workspaceId: string
  unitId: string
  // Sem permissão, o pagamento fica só para leitura e a coluna de ações não aparece.
  canManage: boolean
}

export function ExpensesTable({
  expenses,
  query,
  pathname,
  groups,
  workspaceId,
  unitId,
  canManage,
}: Props) {
  const groupsById = new Map(groups.map((group) => [group.id, group]))

  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0 px-4">Status</TableHead>
            <SortableHead field="date" label="Dia" query={query} pathname={pathname} />
            <SortableHead field="description" label="Descrição" query={query} pathname={pathname} className="w-full" />
            <SortableHead field="group" label="Grupo" query={query} pathname={pathname} className="@max-md:hidden" />
            <SortableHead field="amount" label="Valor" query={query} pathname={pathname} className="text-right" />
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="h-24 px-4 text-center text-muted-foreground">
                Nenhuma despesa encontrada.
              </TableCell>
            </TableRow>
          )}
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell className="px-4">
                <ExpensePaidToggle
                  workspaceId={workspaceId}
                  unitId={unitId}
                  expense={expense}
                  disabled={!canManage}
                />
              </TableCell>
              <TableCell className="px-4 tabular-nums">{dayFormat.format(toDate(expense.date))}</TableCell>
              <TableCell className="max-w-0 px-4 font-medium">
                <div className="flex items-center gap-2">
                  <ExpenseGroupIconBadge icon={groupsById.get(expense.groupId)?.icon ?? null} />
                  <span className="truncate">
                    {expense.description}
                    {expense.series && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                        {expense.series.kind === "installments" ? "Parcela" : "Mês"} {expense.series.number}/
                        {expense.series.count}
                      </span>
                    )}
                  </span>
                </div>
              </TableCell>
              <TableCell className="px-4 @max-md:hidden">
                <Badge variant="secondary">{groupsById.get(expense.groupId)?.name}</Badge>
              </TableCell>
              <TableCell className="px-4 text-right tabular-nums">{money(expense.amountCents)}</TableCell>
              {canManage && (
                <TableCell className="px-4 text-right">
                  <ExpenseActions workspaceId={workspaceId} unitId={unitId} groups={groups} expense={expense} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
