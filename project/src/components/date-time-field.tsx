"use client"

import { useState } from "react"
import { ptBR } from "react-day-picker/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toDate, toDay } from "@/components/day-field"

const dateLabelFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" })

type Props = {
  idPrefix: string
  name: string
  // "2026-09-24T14:30", no horário de Brasília.
  defaultValue: string
}

// Data pelo Calendar e hora por um input; os dois viram um único campo no formato do datetime-local.
export function DateTimeField({ idPrefix, name, defaultValue }: Props) {
  const [day, setDay] = useState(defaultValue.slice(0, 10))
  const [time, setTime] = useState(defaultValue.slice(11, 16))
  const [open, setOpen] = useState(false)

  return (
    <div className="grid grid-cols-2 gap-4">
      <input type="hidden" name={name} value={`${day}T${time}`} />
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-date`}>Data</FieldLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button id={`${idPrefix}-date`} type="button" variant="outline" className="justify-start font-normal" />}
          >
            <CalendarIcon />
            {dateLabelFormat.format(toDate(day))}
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              locale={ptBR}
              selected={toDate(day)}
              defaultMonth={toDate(day)}
              required
              onSelect={(date) => {
                setDay(toDay(date))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-time`}>Hora</FieldLabel>
        <Input
          id={`${idPrefix}-time`}
          type="time"
          step={60}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
        />
      </Field>
    </div>
  )
}
