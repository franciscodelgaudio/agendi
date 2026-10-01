"use client"

import { useState } from "react"
import { ptBR } from "react-day-picker/locale"
import { CalendarIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useReplaceQuery } from "@/components/shared/navigation-progress"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" })

// O Calendar trabalha com Date no fuso do navegador; aqui só importa o dia do calendário.
function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

function toDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function label(from: string, to: string) {
  if (!from && !to) return "Todo o período"
  if (from && to) {
    return from === to ? dayFormat.format(toDate(from)) : `${dayFormat.format(toDate(from))} – ${dayFormat.format(toDate(to))}`
  }
  return from ? `Desde ${dayFormat.format(toDate(from))}` : `Até ${dayFormat.format(toDate(to))}`
}

type Props = {
  // from/to vazios = sem limite; os demais campos da query são preservados na URL.
  query: { from: string; to: string } & Record<string, string>
}

// Intervalo de dias (ambos incluídos) escolhido num Calendar de intervalo.
export function PeriodFilter({ query }: Props) {
  const replaceQuery = useReplaceQuery()
  const [open, setOpen] = useState(false)

  function apply(from: string, to: string) {
    replaceQuery({ ...query, from, to })
  }

  const selected = query.from ? { from: toDate(query.from), to: query.to ? toDate(query.to) : undefined } : undefined

  return (
    <div className="flex w-full items-center gap-1 sm:w-auto">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="flex-1 justify-start font-normal sm:flex-none"
              aria-label="Filtrar por período"
            />
          }
        >
          <CalendarIcon />
          {label(query.from, query.to)}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="range"
            locale={ptBR}
            selected={selected}
            defaultMonth={selected?.from}
            onSelect={(range) => {
              const from = range?.from ? toDay(range.from) : ""
              const to = range?.to ? toDay(range.to) : ""
              apply(from, to)
              if (from && to && from !== to) setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {(query.from || query.to) && (
        <Button variant="ghost" size="icon-sm" aria-label="Limpar período" onClick={() => apply("", "")}>
          <XIcon />
        </Button>
      )}
    </div>
  )
}
