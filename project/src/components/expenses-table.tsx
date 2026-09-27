import { ExpenseActions, ExpensePaidToggle, type ExpenseGroupOption, type ExpenseRow } from "@/components/expense-sheets"
import { currencyFormat } from "@/components/service-format"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
  expenses: ExpenseRow[]
  groups: ExpenseGroupOption[]
  workspaceId: string
  unitId: string
  // Sem permissão, o pagamento fica só para leitura e a coluna de ações não aparece.
  canManage: boolean
}

export function ExpensesTable({ expenses, groups, workspaceId, unitId, canManage }: Props) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  const totalCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  const paidCents = expenses.reduce((sum, expense) => sum + (expense.paid ? expense.amountCents : 0), 0)

  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0 px-4">Paga</TableHead>
            <TableHead className="px-4">Dia</TableHead>
            <TableHead className="w-full px-4">Descrição</TableHead>
            <TableHead className="px-4 @max-md:hidden">Grupo</TableHead>
            <TableHead className="px-4 text-right">Valor</TableHead>
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
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
              <TableCell className="max-w-0 truncate px-4 font-medium">
                {expense.description}
                {expense.series && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {expense.series.kind === "installments" ? "Parcela" : "Mês"} {expense.series.number}/
                    {expense.series.count}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4 @max-md:hidden">
                <Badge variant="secondary">{groupNames.get(expense.groupId)}</Badge>
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
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="px-4 font-semibold">
              Total
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {money(paidCents)} pagos · {money(totalCents - paidCents)} pendentes
              </span>
            </TableCell>
            <TableCell className="@max-md:hidden" />
            <TableCell className="px-4 text-right font-semibold tabular-nums">{money(totalCents)}</TableCell>
            {canManage && <TableCell />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
