import Link from "@/components/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { CASH_FLOW_VIEWS, shiftCashFlowDate, type CashFlowQuery, type CashFlowView, type DayRange } from "@/lib/cash-flow"
import { Button } from "@/components/ui/button"

const viewLabels: Record<CashFlowView, string> = { week: "Semana", month: "Mês", year: "Ano" }
const stepLabels: Record<CashFlowView, [string, string]> = {
  week: ["Semana anterior", "Próxima semana"],
  month: ["Mês anterior", "Próximo mês"],
  year: ["Ano anterior", "Próximo ano"],
}
const currentLabels: Record<CashFlowView, string> = { week: "Esta semana", month: "Este mês", year: "Este ano" }

// As datas são dias do calendário, então são formatadas em UTC para não deslocar.
const monthYearFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" })
const fullDayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

function periodLabel({ view, date }: CashFlowQuery, range: DayRange) {
  if (view === "year") return date.slice(0, 4)
  if (view === "month") return monthYearFormat.format(toDate(date))
  return `${dayMonthFormat.format(toDate(range.from))} a ${fullDayFormat.format(toDate(range.to))}`
}

type Props = {
  query: CashFlowQuery
  // Primeiro e último dia exibidos, para o rótulo da semana.
  range: DayRange
  // Se o período exibido contém hoje, o atalho para o período atual some.
  isCurrent: boolean
  today: string
  pathname: string
  // Com uma visão só, a troca de visão some.
  views?: readonly CashFlowView[]
  // Busca, filtros e ordenação da lista seguem ao trocar de período (sem a página).
  preserve?: Record<string, string>
}

// Troca de visão (semana, mês, ano) e navegação entre períodos.
export function CashFlowNav({ query, range, isCurrent, today, pathname, views = CASH_FLOW_VIEWS, preserve }: Props) {
  function href(next: CashFlowQuery) {
    const params = new URLSearchParams(Object.entries({ ...preserve, ...next }).filter(([, value]) => value))
    return `${pathname}?${params}`
  }
  const [previousLabel, nextLabel] = stepLabels[query.view]

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={previousLabel}
          nativeButton={false}
          render={<Link href={href({ ...query, date: shiftCashFlowDate(query, -1) })} replace scroll={false} />}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={nextLabel}
          nativeButton={false}
          render={<Link href={href({ ...query, date: shiftCashFlowDate(query, 1) })} replace scroll={false} />}
        >
          <ChevronRightIcon />
        </Button>
        {!isCurrent && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={href({ ...query, date: today })} replace scroll={false} />}
          >
            {currentLabels[query.view]}
          </Button>
        )}
        <span className="text-sm font-medium first-letter:uppercase">{periodLabel(query, range)}</span>
      </div>
      {views.length > 1 && (
        <div className="flex gap-1">
          {views.map((view) => (
            <Button
              key={view}
              variant={view === query.view ? "secondary" : "ghost"}
              size="sm"
              aria-current={view === query.view ? "page" : undefined}
              nativeButton={false}
              render={<Link href={href({ view, date: query.date })} replace scroll={false} />}
            >
              {viewLabels[view]}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
