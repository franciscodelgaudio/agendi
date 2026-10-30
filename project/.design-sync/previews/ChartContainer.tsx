import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "agendi"
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from "recharts"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" })

// Gasto (coluna) x planejado (linha) mês a mês, como no "Custos em 2026" da tela inicial.
const costConfig = {
  plannedCents: { label: "Planejado", color: "var(--chart-3)" },
  spentCents: { label: "Gasto", color: "var(--chart-1)" },
}
const costs = [
  { label: "jan", spentCents: 1180000, plannedCents: 1250000 },
  { label: "fev", spentCents: 1090000, plannedCents: 1250000 },
  { label: "mar", spentCents: 1320000, plannedCents: 1250000 },
  { label: "abr", spentCents: 1210000, plannedCents: 1300000 },
  { label: "mai", spentCents: 1270000, plannedCents: 1300000 },
  { label: "jun", spentCents: 1405000, plannedCents: 1300000 },
  { label: "jul", spentCents: 1350000, plannedCents: 1400000 },
  { label: "ago", spentCents: 1290000, plannedCents: 1400000 },
  { label: "set", spentCents: 1380000, plannedCents: 1400000 },
  { label: "out", spentCents: 920000, plannedCents: 1400000 },
  { label: "nov", spentCents: 0, plannedCents: 1450000 },
  { label: "dez", spentCents: 0, plannedCents: 1500000 },
]

export const CostPerMonth = () => (
  <Card>
    <CardHeader>
      <CardTitle>Custos em 2026</CardTitle>
      <CardDescription>R$ 124.150,00 gastos de R$ 162.000,00 planejados</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={costConfig} className="aspect-auto h-56 w-full">
        <ComposedChart data={costs} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(cents: number) => compact.format(cents / 100)}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="spentCents"
            fill="var(--color-spentCents)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Line
            dataKey="plannedCents"
            type="monotone"
            stroke="var(--color-plannedCents)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </CardContent>
  </Card>
)

// Gastos por grupo: rosca com total no centro e legenda em lista ao lado.
const groups = [
  { key: "commission", name: "Comissões", cents: 336450, fill: "var(--chart-2)" },
  { key: "rent", name: "Aluguel", cents: 280000, fill: "var(--chart-1)" },
  { key: "products", name: "Produtos e cosméticos", cents: 142000, fill: "var(--chart-4)" },
  { key: "utilities", name: "Água, luz e internet", cents: 61500, fill: "var(--chart-3)" },
  { key: "marketing", name: "Marketing", cents: 38000, fill: "var(--chart-5)" },
]
const groupsTotal = groups.reduce((sum, g) => sum + g.cents, 0)
const groupsConfig = Object.fromEntries(groups.map((g) => [g.key, { label: g.name, color: g.fill }]))
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })

export const ExpensesByGroup = () => (
  <Card>
    <CardHeader>
      <CardTitle>Gastos por grupo</CardTitle>
      <CardDescription>Outubro de 2026</CardDescription>
    </CardHeader>
    <CardContent className="grid items-center gap-6 sm:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Total no centro em HTML: o <Label> do recharts colide com o Label do DS no global. */}
      <div className="relative mx-auto aspect-square w-full max-w-64">
        <ChartContainer config={groupsConfig} className="aspect-square w-full">
          <PieChart>
            <Pie
              data={groups}
              dataKey="cents"
              nameKey="key"
              innerRadius="60%"
              strokeWidth={2}
              stroke="var(--card)"
              isAnimationActive={false}
            >
              {groups.map((g) => (
                <Cell key={g.key} fill={g.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-base font-semibold tabular-nums">{brl.format(groupsTotal / 100)}</span>
        </div>
      </div>
      <ul className="grid gap-2 text-sm">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: g.fill }} />
            <span className="truncate">{g.name}</span>
            <span className="ml-auto tabular-nums">{brl.format(g.cents / 100)}</span>
            <span className="w-12 text-right text-muted-foreground tabular-nums">
              {percent.format(g.cents / groupsTotal)}
            </span>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
)

// Agendamentos por dia da semana, com a dica aberta sobre a sexta-feira.
const weekConfig = { bookings: { label: "Agendamentos", color: "var(--chart-2)" } }
const week = [
  { day: "seg 26", bookings: 14 },
  { day: "ter 27", bookings: 18 },
  { day: "qua 28", bookings: 16 },
  { day: "qui 29", bookings: 21 },
  { day: "sex 30", bookings: 27 },
  { day: "sáb 31", bookings: 32 },
  { day: "dom 1", bookings: 9 },
]

export const BookingsWithTooltip = () => (
  <Card>
    <CardHeader>
      <CardTitle>Agendamentos da semana</CardTitle>
      <CardDescription>137 agendamentos de 26 de outubro a 1º de novembro</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={weekConfig} className="aspect-auto h-56 w-full">
        <BarChart data={week} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartTooltip defaultIndex={4} cursor={false} content={<ChartTooltipContent />} />
          <Bar
            dataKey="bookings"
            fill="var(--color-bookings)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
)
