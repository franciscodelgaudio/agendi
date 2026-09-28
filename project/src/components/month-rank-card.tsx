import Link from "@/components/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { shiftCashFlowDate } from "@/lib/cash-flow"
import { RankList, type RankItem } from "@/components/unit-overview"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// O mês é um dia do calendário, então é formatado em UTC para não deslocar.
const monthYearFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

type Props = {
  title: string
  action?: React.ReactNode
  avatar?: "round" | "square"
  // Primeiro dia do mês exibido e do mês corrente.
  month: string
  currentMonth: string
  // Link da página para um mês; null volta ao mês corrente.
  href: (month: string | null) => string
  items: RankItem[]
  empty: React.ReactNode
}

// Ranking de um mês, com navegação entre os meses.
export function MonthRankCard({ title, action, avatar, month, currentMonth, href, items, empty }: Props) {
  const query = { view: "month" as const, date: month }
  const link = (target: string) => href(target === currentMonth ? null : target)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Pelo previsto</CardDescription>
        {action}
      </CardHeader>
      <CardContent className="flex-1 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="Mês anterior"
            nativeButton={false}
            render={<Link href={link(shiftCashFlowDate(query, -1))} replace scroll={false} />}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="Próximo mês"
            nativeButton={false}
            render={<Link href={link(shiftCashFlowDate(query, 1))} replace scroll={false} />}
          >
            <ChevronRightIcon />
          </Button>
          <span className="text-sm font-medium first-letter:uppercase">{monthYearFormat.format(toDate(month))}</span>
          {month !== currentMonth && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              nativeButton={false}
              render={<Link href={href(null)} replace scroll={false} />}
            >
              Este mês
            </Button>
          )}
        </div>
        {items.length ? <RankList avatar={avatar} items={items} /> : empty}
      </CardContent>
    </Card>
  )
}
