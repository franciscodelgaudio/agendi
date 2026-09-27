import type { CashFlowView, DayRange, ExpenseCashFlowAmounts, ExpenseCashFlowSummary } from "@/lib/cash-flow"
import { currencyFormat } from "@/components/service-format"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// As datas são dias do calendário, então são formatadas em UTC para não deslocar.
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

function bucketLabel(view: CashFlowView, { from, to }: DayRange) {
  if (view === "week") return weekdayFormat.format(toDate(from))
  if (view === "year") return monthFormat.format(toDate(from))
  return from === to
    ? dayMonthFormat.format(toDate(from))
    : `${dayMonthFormat.format(toDate(from))} a ${dayMonthFormat.format(toDate(to))}`
}

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

type Props = {
  view: CashFlowView
  summary: ExpenseCashFlowSummary
  // Sem repasse (espaço próprio), comissão, salário nem despesas, bruto e líquido são iguais e só o bruto aparece.
  hasPartnerShare: boolean
  hasCommission: boolean
  hasSalary: boolean
  hasExpenses: boolean
  today: string
}

type Columns = { partnerShare: boolean; commission: boolean; salary: boolean; expenses: boolean }

// Conforme a tabela estreita, somem as deduções do previsto, depois o previsto inteiro e por
// último as deduções do real. Sem as deduções, o cabeçalho do grupo cobre só bruto e líquido.
// Sem nenhuma dedução (só bruto), as três colunas sempre cabem.
type GroupHide = { group: string; deduction: string; compactHead: string }
const realHide: GroupHide = { group: "", deduction: "@max-2xl:hidden", compactHead: "hidden @max-2xl:table-cell" }
const forecastHide: GroupHide = {
  group: "@max-4xl:hidden",
  deduction: "@max-7xl:hidden",
  compactHead: "hidden @max-7xl:table-cell @max-4xl:hidden",
}

function Deduction({ cents, className }: { cents: number; className: string }) {
  return (
    <TableCell className={cn("px-4 text-right text-muted-foreground tabular-nums", className)}>
      {cents ? `−${money(cents)}` : money(0)}
    </TableCell>
  )
}

function AmountCells({ amounts, columns, hide }: { amounts: ExpenseCashFlowAmounts; columns: Columns; hide: GroupHide }) {
  const detailed = columns.partnerShare || columns.commission || columns.salary || columns.expenses
  const deduction = cn(hide.group, hide.deduction)
  return (
    <>
      <TableCell className={cn("px-4 text-right tabular-nums", detailed && hide.group)}>{money(amounts.grossCents)}</TableCell>
      {columns.partnerShare && <Deduction cents={amounts.partnerShareCents} className={deduction} />}
      {columns.commission && <Deduction cents={amounts.commissionCents} className={deduction} />}
      {columns.salary && <Deduction cents={amounts.salaryCents} className={deduction} />}
      {columns.expenses && <Deduction cents={amounts.expenseCents} className={deduction} />}
      {detailed && (
        <TableCell className={cn("px-4 text-right font-medium tabular-nums", hide.group)}>
          {money(amounts.netCents)}
        </TableCell>
      )}
    </>
  )
}

// Real: atendimentos registrados e despesas pagas. Previsto: real mais os agendamentos
// futuros e as despesas pendentes.
export function CashFlowTable({ view, summary, hasPartnerShare, hasCommission, hasSalary, hasExpenses, today }: Props) {
  const columns = { partnerShare: hasPartnerShare, commission: hasCommission, salary: hasSalary, expenses: hasExpenses }
  const detailed = hasPartnerShare || hasCommission || hasSalary || hasExpenses
  const groupSpan = 2 + Number(hasPartnerShare) + Number(hasCommission) + Number(hasSalary) + Number(hasExpenses)
  const amountHeads = (group: string, hide: GroupHide) => {
    const deduction = cn("px-4 text-right", hide.group, hide.deduction)
    return detailed ? (
      <>
        <TableHead className={cn("px-4 text-right", hide.group)}>Bruto</TableHead>
        {hasPartnerShare && <TableHead className={deduction}>Repasse</TableHead>}
        {hasCommission && <TableHead className={deduction}>Comissão</TableHead>}
        {hasSalary && <TableHead className={deduction}>Salário e bônus</TableHead>}
        {hasExpenses && <TableHead className={deduction}>Despesas</TableHead>}
        <TableHead className={cn("px-4 text-right", hide.group)}>Líquido</TableHead>
      </>
    ) : (
      <TableHead className="px-4 text-right">{group}</TableHead>
    )
  }
  const groupHeads = (group: string, hide: GroupHide) => (
    <>
      <TableHead colSpan={groupSpan} className={cn("border-l px-4 text-center", hide.group, hide.deduction)}>
        {group}
      </TableHead>
      <TableHead colSpan={2} className={cn("border-l px-4 text-center", hide.compactHead)}>
        {group}
      </TableHead>
    </>
  )

  return (
    <div className="border">
      <Table>
        <TableHeader>
          {detailed && (
            <TableRow>
              <TableHead className="px-4" />
              {groupHeads("Real", realHide)}
              {groupHeads("Previsto", forecastHide)}
            </TableRow>
          )}
          <TableRow>
            <TableHead className="px-4">Período</TableHead>
            {amountHeads("Real", realHide)}
            {amountHeads("Previsto", forecastHide)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.buckets.map((bucket) => {
            const isCurrent = bucket.from <= today && today <= bucket.to
            return (
              <TableRow key={bucket.from} className={cn(isCurrent && "bg-muted/50")}>
                <TableCell className="px-4 first-letter:uppercase">
                  {bucketLabel(view, bucket)}
                  {isCurrent && <span className="ml-2 text-xs text-muted-foreground">(atual)</span>}
                </TableCell>
                <AmountCells amounts={bucket.real} columns={columns} hide={realHide} />
                <AmountCells amounts={bucket.forecast} columns={columns} hide={forecastHide} />
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="px-4 font-semibold">Total</TableCell>
            <AmountCells amounts={summary.total.real} columns={columns} hide={realHide} />
            <AmountCells amounts={summary.total.forecast} columns={columns} hide={forecastHide} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
