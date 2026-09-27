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

// Com a tabela estreita, somem as deduções e ficam só bruto e líquido.
const DEDUCTION = "@max-2xl:hidden"

function Deduction({ cents, className }: { cents: number; className: string }) {
  return (
    <TableCell className={cn("px-4 text-right text-muted-foreground tabular-nums", className)}>
      {cents ? `−${money(cents)}` : money(0)}
    </TableCell>
  )
}

function AmountCells({ amounts, columns }: { amounts: ExpenseCashFlowAmounts; columns: Columns }) {
  const detailed = columns.partnerShare || columns.commission || columns.salary || columns.expenses
  return (
    <>
      <TableCell className="px-4 text-right tabular-nums">{money(amounts.grossCents)}</TableCell>
      {columns.partnerShare && <Deduction cents={amounts.partnerShareCents} className={DEDUCTION} />}
      {columns.commission && <Deduction cents={amounts.commissionCents} className={DEDUCTION} />}
      {columns.salary && <Deduction cents={amounts.salaryCents} className={DEDUCTION} />}
      {columns.expenses && <Deduction cents={amounts.expenseCents} className={DEDUCTION} />}
      {detailed && <TableCell className="px-4 text-right font-medium tabular-nums">{money(amounts.netCents)}</TableCell>}
    </>
  )
}

// Atendimentos registrados e despesas pagas.
export function CashFlowTable({ view, summary, hasPartnerShare, hasCommission, hasSalary, hasExpenses, today }: Props) {
  const columns = { partnerShare: hasPartnerShare, commission: hasCommission, salary: hasSalary, expenses: hasExpenses }
  const detailed = hasPartnerShare || hasCommission || hasSalary || hasExpenses
  const deduction = cn("px-4 text-right", DEDUCTION)

  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4">Período</TableHead>
            {detailed ? (
              <>
                <TableHead className="px-4 text-right">Bruto</TableHead>
                {hasPartnerShare && <TableHead className={deduction}>Repasse</TableHead>}
                {hasCommission && <TableHead className={deduction}>Comissão</TableHead>}
                {hasSalary && <TableHead className={deduction}>Salário e bônus</TableHead>}
                {hasExpenses && <TableHead className={deduction}>Despesas</TableHead>}
                <TableHead className="px-4 text-right">Líquido</TableHead>
              </>
            ) : (
              <TableHead className="px-4 text-right">Bruto</TableHead>
            )}
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
                <AmountCells amounts={bucket.real} columns={columns} />
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="px-4 font-semibold">Total</TableCell>
            <AmountCells amounts={summary.total.real} columns={columns} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
