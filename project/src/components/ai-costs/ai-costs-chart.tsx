"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatBucket, formatCompact, formatUsd } from "@/components/ai-costs/ai-costs-format"

type Props = {
  series: Record<string, string | number>[]
  chartSeries: { id: string; key: string; label: string }[]
  colors: Map<string, string>
}

// Barras empilhadas por bucket, uma cor por grupo; o topo da pilha é arredondado e os segmentos
// ficam separados por 2px da cor do cartão.
export function AiCostsChart({ series, chartSeries, colors }: Props) {
  const config = Object.fromEntries(
    chartSeries.map((entry) => [entry.id, { label: entry.label, color: colors.get(entry.key) }]),
  ) satisfies ChartConfig
  const data = series.map((point) => ({ ...point, bucket: formatBucket(String(point.date)) }))

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(value: number) => `$${formatCompact(value)}`} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex min-w-40 flex-1 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                  <span className="truncate text-muted-foreground">{config[String(name)]?.label}</span>
                  <span className="ml-auto font-mono font-medium text-foreground tabular-nums">{formatUsd(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {chartSeries.map((entry, i) => (
          <Bar
            key={entry.id}
            dataKey={entry.id}
            stackId="cost"
            fill={`var(--color-${entry.id})`}
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === chartSeries.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
