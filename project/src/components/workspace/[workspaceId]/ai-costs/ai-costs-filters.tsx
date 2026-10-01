"use client"

import { useState } from "react"
import { ptBR } from "react-day-picker/locale"
import { CalendarIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"
import { COST_GRANULARITIES, COST_PERIODS, type CostQuery } from "@/service/workspace/[workspaceId]/ai-costs/ai-usage"
import { formatRange } from "@/components/workspace/[workspaceId]/ai-costs/ai-costs-format"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export const periodLabels: Record<(typeof COST_PERIODS)[number], string> = {
  thismonth: "Este mês",
  yesterday: "Ontem",
  last7days: "Últimos 7 dias",
  last30days: "Últimos 30 dias",
  last90days: "Últimos 90 dias",
  lastmonth: "Mês passado",
}

const granularityLabels: Record<(typeof COST_GRANULARITIES)[number], string> = { daily: "Dia", weekly: "Semana", monthly: "Mês" }

export const groupByLabels = { action: "Ação", model: "Modelo", user: "Usuário" } as const

export type FacetOption = { value: string; label: string; count: number }
type Facets = { action: FacetOption[]; model: FacetOption[]; user: FacetOption[] }
export type CostUpdate = Partial<Record<"period" | "startDate" | "endDate" | "granularity" | "groupBy" | "action" | "model" | "user", string>>

const CUSTOM = "custom"

const pad = (n: number) => String(n).padStart(2, "0")
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function AiCostsFilters({ query, facets, onChange }: { query: CostQuery; facets: Facets; onChange: (update: CostUpdate) => void }) {
  const [rangeOpen, setRangeOpen] = useState(false)
  const periodItems = [
    ...COST_PERIODS.map((value) => ({ value, label: periodLabels[value] })),
    { value: CUSTOM, label: "Período personalizado" },
  ]
  const groupItems = Object.entries(groupByLabels).map(([value, label]) => ({ value, label }))
  const hasFilters = query.action.length + query.model.length + query.user.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={periodItems}
        value={query.period ?? CUSTOM}
        onValueChange={(value) => {
          if (value === CUSTOM) return setRangeOpen(true)
          onChange({ period: String(value), startDate: "", endDate: "" })
        }}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Período">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periodItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
        <PopoverTrigger render={<Button variant={query.period ? "outline" : "secondary"} className="font-normal" />}>
          <CalendarIcon />
          {formatRange(query.startDate, query.endDate)}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={2}
            defaultMonth={toDate(query.startDate)}
            selected={{ from: toDate(query.startDate), to: toDate(query.endDate) }}
            onSelect={(range) => {
              if (!range?.from || !range?.to || range.from.getTime() === range.to.getTime()) return
              onChange({ period: "", startDate: toDay(range.from), endDate: toDay(range.to) })
              setRangeOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <div className="flex rounded-md border p-0.5" role="group" aria-label="Agrupar o gráfico por">
        {COST_GRANULARITIES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={query.granularity === value ? "secondary" : "ghost"}
            className="h-7"
            aria-pressed={query.granularity === value}
            onClick={() => onChange({ granularity: value })}
          >
            {granularityLabels[value]}
          </Button>
        ))}
      </div>

      <Select items={groupItems} value={query.groupBy} onValueChange={(value) => onChange({ groupBy: String(value) })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Detalhar por">
          <span className="text-muted-foreground">Por</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groupItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Facet label="Ação" options={facets.action} selected={query.action} onChange={(value) => onChange({ action: value })} />
      <Facet label="Modelo" options={facets.model} selected={query.model} onChange={(value) => onChange({ model: value })} />
      <Facet label="Usuário" options={facets.user} selected={query.user} onChange={(value) => onChange({ user: value })} />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ action: "", model: "", user: "" })}>
          <XIcon />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}

function Facet({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: FacetOption[]
  selected: string[]
  onChange: (value: string) => void
}) {
  if (options.length === 0) return null
  const toggle = (value: string) =>
    onChange((selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]).join(","))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className={cn("border-dashed font-normal", selected.length && "border-solid")} />}>
        {label}
        {selected.length > 0 && <span className="rounded-sm bg-secondary px-1.5 text-xs tabular-nums">{selected.length}</span>}
        <ChevronDownIcon className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => toggle(option.value)}
            closeOnClick={false}
          >
            <span className="truncate">{option.label}</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
