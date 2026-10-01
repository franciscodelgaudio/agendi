"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import type { CashFlowView, CostCurvePoint, DayRange } from "@/lib/cash-flow"
import { currencyFormat } from "@/components/service-format"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// As datas são dias do calendário, então são formatadas em UTC para não deslocar.
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
const longDayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
const shortMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
const longMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
const compactFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" })

// Planejado e gasto têm a mesma cor nos dois gráficos.
const periodConfig = {
  plannedCents: { label: "Planejado", color: "var(--chart-3)" },
  spentCents: { label: "Gasto", color: "var(--chart-1)" },
} satisfies ChartConfig
const cumulativeConfig = {
  plannedCumulativeCents: { label: "Planejado acumulado", color: "var(--chart-3)" },
  spentCumulativeCents: { label: "Gasto acumulado", color: "var(--chart-1)" },
} satisfies ChartConfig

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

// Semana: um dia por ponto; mês: uma semana; ano: um mês.
function tickLabel(view: CashFlowView, { from, to }: DayRange) {
  if (view === "week") return `${weekdayFormat.format(toDate(from)).replace(".", "")} ${Number(from.slice(8))}`
  if (view === "month") return `${Number(from.slice(8))}–${Number(to.slice(8))}`
  return shortMonthFormat.format(toDate(from)).replace(".", "")
}

function longLabel(view: CashFlowView, { from, to }: DayRange) {
  if (view === "week") return longDayFormat.format(toDate(from))
  if (view === "month") return `${Number(from.slice(8))} a ${Number(to.slice(8))} de ${longMonthFormat.format(toDate(from))}`
  return longMonthFormat.format(toDate(from))
}

type Datum = CostCurvePoint & { label: string; longLabel: string }
type Props = { points: CostCurvePoint[]; view: CashFlowView }

function toData({ points, view }: Props): Datum[] {
  return points.map((point) => ({ ...point, label: tickLabel(view, point), longLabel: longLabel(view, point) }))
}

function Tip({ config }: { config: ChartConfig }) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => (
            <span className="first-letter:uppercase">{(payload?.[0]?.payload as Datum | undefined)?.longLabel}</span>
          )}
          formatter={(value, name, item) => (
            <div className="flex w-full items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{config[String(name)]?.label}</span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                {currencyFormat.format(Number(value) / 100)}
              </span>
            </div>
          )}
        />
      }
    />
  )
}

const X_AXIS = { dataKey: "label", tickLine: false, axisLine: false, tickMargin: 8, minTickGap: 4 } as const
const Y_AXIS = {
  tickLine: false,
  axisLine: false,
  width: 64,
  tickFormatter: (cents: number) => compactFormat.format(cents / 100),
} as const

// Despesas de cada período: gasto (pago) em coluna, planejado (limite dos grupos) em linha.
export function CostPeriodChart(props: Props) {
  return (
    <ChartContainer config={periodConfig} className="aspect-auto h-56 w-full">
      <ComposedChart data={toData(props)} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis {...X_AXIS} />
        <YAxis {...Y_AXIS} />
        <Tip config={periodConfig} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="spentCents" fill="var(--color-spentCents)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Line
          dataKey="plannedCents"
          type="monotone"
          stroke="var(--color-plannedCents)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

// Curva S: gasto acumulado em coluna, planejado acumulado em linha.
export function CostCumulativeChart(props: Props) {
  return (
    <ChartContainer config={cumulativeConfig} className="aspect-auto h-56 w-full">
      <ComposedChart data={toData(props)} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis {...X_AXIS} />
        <YAxis {...Y_AXIS} />
        <Tip config={cumulativeConfig} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="spentCumulativeCents"
          fill="var(--color-spentCumulativeCents)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
        <Line
          dataKey="plannedCumulativeCents"
          type="monotone"
          stroke="var(--color-plannedCumulativeCents)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
