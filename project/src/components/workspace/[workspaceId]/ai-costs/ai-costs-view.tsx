"use client"

import { CheckIcon, ChartNoAxesColumnIcon, FilterIcon } from "lucide-react"
import { Line, LineChart } from "recharts"
import { cn } from "@/service/_shared/utils"
import { AI_COST_PAGE_SIZE, AI_USAGE_ACTIONS, costDelta, OTHERS_KEY, type CostQuery } from "@/service/workspace/[workspaceId]/ai-costs/ai-usage"
import type { AiCosts } from "@/service/workspace/[workspaceId]/ai-costs/ai-usage-store"
import { AiCostsChart } from "@/components/workspace/[workspaceId]/ai-costs/ai-costs-chart"
import { AiCostsFilters, groupByLabels, type CostUpdate } from "@/components/workspace/[workspaceId]/ai-costs/ai-costs-filters"
import { AI_PALETTE_CLASSES, colorMap, formatInteger, formatRange, formatUsd } from "@/components/workspace/[workspaceId]/ai-costs/ai-costs-format"
import { ListPagination } from "@/components/shared/list-pagination"
import { useReplaceQuery } from "@/components/shared/navigation-progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const whenFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
})
const shareFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

// Query da URL em texto: só o que difere do padrão aparece.
export function costUrlQuery(query: CostQuery): Record<string, string> {
  return {
    period: query.period && query.period !== "thismonth" ? query.period : "",
    startDate: query.period ? "" : query.startDate,
    endDate: query.period ? "" : query.endDate,
    granularity: query.granularity === "daily" ? "" : query.granularity,
    groupBy: query.groupBy === "action" ? "" : query.groupBy,
    action: query.action.join(","),
    model: query.model.join(","),
    user: query.user.join(","),
  }
}

export function AiCostsView({ costs, query, pathname }: { costs: AiCosts; query: CostQuery; pathname: string }) {
  const replaceQuery = useReplaceQuery()
  const urlQuery = costUrlQuery(query)
  // Mudar um filtro volta para a primeira página de eventos.
  const change = (update: CostUpdate) => replaceQuery({ ...urlQuery, ...update })
  const colors = colorMap(
    costs.groups.map((g) => g.key).concat(costs.chartSeries.some((s) => s.key === OTHERS_KEY) ? [OTHERS_KEY] : []),
    query.groupBy === "action" ? AI_USAGE_ACTIONS : undefined,
  )
  const selected: string[] = query[query.groupBy]
  const toggleGroup = (key: string) =>
    change({ [query.groupBy]: (selected.includes(key) ? selected.filter((v) => v !== key) : [...selected, key]).join(",") })

  const delta = costDelta(costs.totals.costUsd, costs.previousCostUsd)
  const top = costs.groups[0]
  const groupLabel = groupByLabels[query.groupBy]
  const range = formatRange(query.startDate, query.endDate)

  return (
    <div className={cn("flex flex-col gap-4", AI_PALETTE_CLASSES)}>
      <AiCostsFilters query={query} facets={costs.facets} onChange={change} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Gasto no período"
          value={formatUsd(costs.totals.costUsd)}
          note={
            <>
              {delta && <span className={cn("font-medium", delta.tone === "up" ? "text-destructive" : "text-primary")}>{delta.label} </span>}
              Anterior: {formatUsd(costs.previousCostUsd)}
            </>
          }
        />
        <Kpi
          label="Requisições"
          value={formatInteger(costs.totals.requests)}
          note={`${formatUsd(costs.totals.requests ? costs.totals.costUsd / costs.totals.requests : 0)} por requisição`}
        />
        <Kpi label="Tokens" value={formatInteger(costs.totals.tokens)} note={costs.totals.unpriced ? `${costs.totals.unpriced} sem preço do modelo` : "Entrada e saída"} />
        <Kpi
          label="Maior consumo"
          value={top ? top.label : "—"}
          note={top ? `${formatUsd(top.costUsd)} · ${shareFormat.format(top.share)}% do total` : "Sem consumo no período"}
        />
      </div>

      {costs.totals.requests === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumnIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum consumo entre {range}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Gasto por {groupLabel.toLowerCase()}</CardTitle>
              <CardDescription>
                {formatUsd(costs.totals.costUsd)} entre {range}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AiCostsChart series={costs.series} chartSeries={costs.chartSeries} colors={colors} />
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{groupLabel}</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="@max-md:hidden">Participação</TableHead>
                  <TableHead className="text-right @max-lg:hidden">Requisições</TableHead>
                  <TableHead className="text-right @max-xl:hidden">Tokens</TableHead>
                  <TableHead className="pr-4 @max-2xl:hidden">Tendência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.groups.map((group) => {
                  const color = colors.get(group.key) ?? colors.get(OTHERS_KEY) ?? "var(--muted-foreground)"
                  const active = selected.includes(group.key)
                  return (
                    <TableRow key={group.key} data-state={active ? "selected" : undefined}>
                      <TableCell className="w-full max-w-0 pl-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto min-w-0 shrink justify-start px-1.5 py-1 font-normal"
                            title={group.label}
                            onClick={() => toggleGroup(group.key)}
                          >
                            {active ? <CheckIcon /> : <FilterIcon className="opacity-40" />}
                            <span className="truncate">{group.label}</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{formatUsd(group.costUsd)}</TableCell>
                      <TableCell className="@max-md:hidden">
                        <div className="flex items-center gap-2">
                          <span className="relative block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(group.share, 100)}%`, backgroundColor: color }} />
                          </span>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">{shareFormat.format(group.share)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums @max-lg:hidden">{formatInteger(group.requests)}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums @max-xl:hidden">{formatInteger(group.tokens)}</TableCell>
                      <TableCell className="pr-4 @max-2xl:hidden">
                        <Sparkline series={group.series} color={color} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          <h4 className="mt-2 font-semibold tracking-tight">Eventos</h4>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="@max-xl:hidden">Usuário</TableHead>
                  <TableHead className="@max-2xl:hidden">Modelo</TableHead>
                  <TableHead className="text-right @max-lg:hidden">Tokens</TableHead>
                  <TableHead className="pr-4 text-right">Gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.events.rows.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground tabular-nums">
                      {whenFormat.format(new Date(event.createdAt))}
                    </TableCell>
                    <TableCell className="w-full max-w-0 truncate">{event.action}</TableCell>
                    <TableCell className="@max-xl:hidden">{event.user}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground @max-2xl:hidden">{event.model}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums @max-lg:hidden">{formatInteger(event.tokens)}</TableCell>
                    <TableCell className="pr-4 text-right font-mono font-medium tabular-nums">
                      {event.costUsd == null ? "—" : formatUsd(event.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ListPagination
            query={urlQuery}
            page={query.page}
            pageSize={AI_COST_PAGE_SIZE}
            total={costs.events.total}
            pathname={pathname}
            itemLabel="eventos"
          />
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="grid min-w-0 gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-xl font-semibold tabular-nums" title={value}>
          {value}
        </span>
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      </CardContent>
    </Card>
  )
}

function Sparkline({ series, color }: { series: { date: string; value: number }[]; color: string }) {
  if (series.length < 2) return null
  return (
    <ChartContainer config={{ value: { label: "Gasto", color } }} className="aspect-auto h-8 w-24">
      <LineChart data={series}>
        <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}
