"use client"

import type { BusinessHours } from "@/lib/business-hours"

import { Field, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// De meia em meia hora, de "00:00" a "24:00".
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`)
const OPENS = TIMES.slice(0, -1).map((value) => ({ value, label: value }))
const CLOSES = TIMES.slice(1).map((value) => ({ value, label: value }))

const DEFAULT_HOURS: BusinessHours = { opensAt: "08:00", closesAt: "22:00" }

function TimeSelect({ id, name, label, items, defaultValue }: {
  id: string
  name: string
  label: string
  items: { value: string; label: string }[]
  defaultValue: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select name={name} items={items} defaultValue={defaultValue} required>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

// Horário de funcionamento da unidade; define a faixa de horas visível no calendário.
export function BusinessHoursFields({ idPrefix, defaultValue }: { idPrefix: string; defaultValue?: BusinessHours }) {
  const hours = defaultValue ?? DEFAULT_HOURS
  return (
    <>
      <FieldSeparator>Horário de funcionamento</FieldSeparator>
      <div className="grid grid-cols-2 gap-4">
        <TimeSelect id={`${idPrefix}-opens-at`} name="opensAt" label="Abre às" items={OPENS} defaultValue={hours.opensAt} />
        <TimeSelect id={`${idPrefix}-closes-at`} name="closesAt" label="Fecha às" items={CLOSES} defaultValue={hours.closesAt} />
      </div>
    </>
  )
}
