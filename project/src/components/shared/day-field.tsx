"use client"

import { useState } from "react"
import { ptBR } from "react-day-picker/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const dateLabelFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" })

// O Calendar trabalha com Date no fuso do navegador; aqui só importa o dia do calendário.
export function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function toDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type Props = {
  id: string
  name: string
  label: string
  // "2026-09-24"; vazio mostra o placeholder até escolher um dia.
  defaultValue: string
  placeholder?: string
}

// Dia escolhido pelo Calendar, enviado como "2026-09-24" num campo oculto.
export function DayField({ id, name, label, defaultValue, placeholder }: Props) {
  const [day, setDay] = useState(defaultValue)
  const [open, setOpen] = useState(false)

  return (
    <Field>
      <input type="hidden" name={name} value={day} />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button id={id} type="button" variant="outline" className="justify-start font-normal" />}>
          <CalendarIcon />
          {day ? dateLabelFormat.format(toDate(day)) : <span className="text-muted-foreground">{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={day ? toDate(day) : undefined}
            defaultMonth={day ? toDate(day) : undefined}
            required
            onSelect={(date) => {
              setDay(toDay(date))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
