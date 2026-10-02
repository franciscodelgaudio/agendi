import type { ExpenseGroupYearOverview, ExpenseOwner, YearOverviewCell, YearOverviewRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import { PlannedLimitCell } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/planned-limit-cell"
import { currencyFormat } from "@/components/shared/service-format"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/service/_shared/utils"

// Os meses são do calendário, então são formatados em UTC para não deslocar.
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number)
  return monthFormat.format(new Date(Date.UTC(year, index - 1, 1)))
}

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

// A coluna do mês fica parada enquanto os grupos rolam para o lado.
const STICKY = "sticky left-0 z-10 bg-background"
const NUMBER = "px-4 text-right whitespace-nowrap tabular-nums"

// Quem gerencia edita o planejado de cada grupo em cada mês.
type Editing = { workspaceId: string; owner: ExpenseOwner }

// Célula de planejado editável: o grupo, o mês dela e o mês seguinte (null em dezembro).
type EditableCell = Editing & { groupId: string; month: string; nextMonth: string | null }

const cellId = (groupId: string, month: string) => `planned-${groupId}-${month}`

// Planejado e gasto; sem limite, o planejado fica com traço e o gasto nunca passa dele.
function AmountCells({ plannedCents, paidCents, editable }: YearOverviewCell & { editable?: EditableCell }) {
  return (
    <>
      <TableCell className={cn(NUMBER, "border-l text-muted-foreground")}>
        {editable ? (
          // Remonta quando o servidor devolve o valor salvo, para sair do estado de salvando.
          <PlannedLimitCell
            key={String(plannedCents)}
            workspaceId={editable.workspaceId}
            owner={editable.owner}
            groupId={editable.groupId}
            month={editable.month}
            cents={plannedCents}
            cellId={cellId(editable.groupId, editable.month)}
            nextCellId={editable.nextMonth && cellId(editable.groupId, editable.nextMonth)}
          />
        ) : plannedCents === null ? (
          "—"
        ) : (
          money(plannedCents)
        )}
      </TableCell>
      <TableCell className={cn(NUMBER, plannedCents !== null && paidCents > plannedCents && "text-destructive")}>
        {money(paidCents)}
      </TableCell>
    </>
  )
}

function RowCells({ row, editable }: { row: YearOverviewRow; editable?: (EditableCell | undefined)[] }) {
  return (
    <>
      {row.cells.map((cell, i) => (
        <AmountCells key={i} {...cell} editable={editable?.[i]} />
      ))}
      <AmountCells plannedCents={row.plannedCents} paidCents={row.paidCents} />
    </>
  )
}

// Mês a mês do ano: planejado (limite) e gasto (pago) de cada grupo cadastrado. Exceção à regra
// das tabelas: com muitos grupos, rola na horizontal. Com editing, o planejado de cada grupo é
// editável; o gasto vem das despesas e os totais são somas, então não são.
export function ExpenseGroupsYearTable({
  overview,
  editing,
}: {
  overview: ExpenseGroupYearOverview
  editing: Editing | null
}) {
  const columns = [...overview.groups.map((group) => ({ id: group.id, name: group.name })), { id: "total", name: "Total" }]

  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2} className={cn(STICKY, "px-4")}>
              Mês
            </TableHead>
            {columns.map((column) => (
              <TableHead key={column.id} colSpan={2} className="border-l px-4 text-center whitespace-nowrap">
                {column.name}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {columns.map((column) => (
              <TableHeadPair key={column.id} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {overview.rows.map((row, r) => (
            <TableRow key={row.month}>
              <TableCell className={cn(STICKY, "px-4 font-medium whitespace-nowrap first-letter:uppercase")}>
                {monthLabel(row.month)}
              </TableCell>
              <RowCells
                row={row}
                editable={
                  editing
                    ? overview.groups.map((group) => ({
                        ...editing,
                        groupId: group.id,
                        month: row.month,
                        nextMonth: overview.rows[r + 1]?.month ?? null,
                      }))
                    : undefined
                }
              />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className={cn(STICKY, "bg-muted px-4 font-semibold")}>Total</TableCell>
            <RowCells row={overview.total} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function TableHeadPair() {
  return (
    <>
      <TableHead className="border-l px-4 text-right font-normal whitespace-nowrap text-muted-foreground">Planejado</TableHead>
      <TableHead className="px-4 text-right font-normal whitespace-nowrap text-muted-foreground">Gasto</TableHead>
    </>
  )
}
