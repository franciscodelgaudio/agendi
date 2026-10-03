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
  // Com today, o padrão (from/to vazios) é o dia de hoje e "todo o período" vai como period=all.
  today?: string
}

// Intervalo de dias (ambos incluídos) escolhido num Calendar de intervalo.
export function PeriodFilter({ query, today }: Props) {
  const replaceQuery = useReplaceQuery()
  const [open, setOpen] = useState(false)

  function apply(from: string, to: string, period = "") {
    replaceQuery(today ? { ...query, from, to, period } : { ...query, from, to })
  }

  const all = !!today && query.period === "all"
  const isDefault = !!today && !all && !query.from && !query.to
  // Sem datas na URL, o padrão (hoje) aparece no botão e no calendário.
  const from = isDefault ? today : query.from
  const to = isDefault ? today : query.to
  const selected = from ? { from: toDate(from), to: to ? toDate(to) : undefined } : undefined
  const text = all ? "Todo o período" : from === today && to === today ? "Hoje" : label(from, to)

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
          {text}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          {today && (
            <div className="flex gap-1 border-b p-2">
              <Button
                variant={isDefault || (from === today && to === today) ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  apply("", "")
                  setOpen(false)
                }}
              >
                Hoje
              </Button>
              <Button
                variant={all ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  apply("", "", "all")
                  setOpen(false)
                }}
              >
                Todo o período
              </Button>
            </div>
          )}
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
      {(today ? !isDefault : query.from || query.to) && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={today ? "Voltar para hoje" : "Limpar período"}
          onClick={() => apply("", "")}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
