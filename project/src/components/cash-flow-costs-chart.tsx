"use client"

import { Cell, Label, Pie, PieChart } from "recharts"
import type { CostRow } from "@/lib/cash-flow"
import type { ExpenseGroupIcon } from "@/lib/expense-group-icon"
import { currencyFormat } from "@/components/service-format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

type Group = { id: string; name: string; icon: ExpenseGroupIcon | null }

// Repasse e equipe usam as cores do tema; cada grupo, a cor do próprio ícone.
const STAFF: Record<Exclude<CostRow<Group>["kind"], "group">, { name: string; color: string }> = {
  partner_share: { name: "Repasse", color: "var(--chart-1)" },
  commission: { name: "Comissões", color: "var(--chart-2)" },
  salary: { name: "Salário e bônus", color: "var(--chart-4)" },
}

const percentFormat = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

type Datum = { key: string; name: string; cents: number; share: number; fill: string }

function toDatum(row: CostRow<Group>): Datum {
  if (row.kind === "group") {
    const { id, name, icon } = row.group
    return { key: id, name, cents: row.cents, share: row.share, fill: icon?.color ?? "var(--muted-foreground)" }
  }
  const { name, color } = STAFF[row.kind]
  return { key: row.kind, name, cents: row.cents, share: row.share, fill: color }
}

// Valor e fatia do total na dica, com a cor do item.
function Tooltip() {
  return (
    <ChartTooltip
      cursor={false}
      content={
        <ChartTooltipContent
          hideLabel
          formatter={(_, __, item) => {
            const datum = item.payload as Datum
            return (
              <div className="flex w-full items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: datum.fill }} />
                <span className="text-muted-foreground">{datum.name}</span>
                <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                  {money(datum.cents)} · {percentFormat.format(datum.share)}
                </span>
              </div>
            )
          }}
        />
      }
    />
  )
}

export function CashFlowCostsChart({ rows, totalCents }: { rows: CostRow<Group>[]; totalCents: number }) {
  const data = rows.map(toDatum)
  const config = Object.fromEntries(data.map((datum) => [datum.key, { label: datum.name, color: datum.fill }])) satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por grupo</CardTitle>
      </CardHeader>
      <CardContent className="grid items-center gap-6 sm:grid-cols-[16rem_minmax(0,1fr)]">
        <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-64">
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey="cents" nameKey="key" innerRadius="60%" strokeWidth={2} stroke="var(--card)">
              {data.map((datum) => (
                <Cell key={datum.key} fill={datum.fill} />
              ))}
              <Label
                content={({ viewBox }) =>
                  viewBox && "cx" in viewBox && "cy" in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 10} className="fill-muted-foreground text-xs">
                        Total
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 10} className="fill-foreground text-base font-semibold">
                        {money(totalCents)}
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="grid gap-2 text-sm">
          {data.map((datum) => (
            <li key={datum.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: datum.fill }} />
              <span className="truncate">{datum.name}</span>
              <span className="ml-auto tabular-nums">{money(datum.cents)}</span>
              <span className="w-12 text-right text-muted-foreground tabular-nums">{percentFormat.format(datum.share)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
