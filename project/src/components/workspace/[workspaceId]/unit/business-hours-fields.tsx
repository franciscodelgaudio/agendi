"use client"

import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"

import { RequiredMark } from "@/components/shared/field-hints"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
    <div className="min-w-0 flex-1">
      <Select name={name} items={items} defaultValue={defaultValue} required>
        <SelectTrigger id={id} aria-label={label} className="w-full">
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
    </div>
  )
}

export function BusinessHoursFields({ idPrefix, defaultValue }: { idPrefix: string; defaultValue?: BusinessHours }) {
  const hours = defaultValue ?? DEFAULT_HOURS
  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-opens-at`}>
        Horário de funcionamento <RequiredMark />
      </FieldLabel>
      <div className="flex items-center gap-2">
        <TimeSelect id={`${idPrefix}-opens-at`} name="opensAt" label="Abre às" items={OPENS} defaultValue={hours.opensAt} />
        <span className="text-sm text-muted-foreground">às</span>
        <TimeSelect id={`${idPrefix}-closes-at`} name="closesAt" label="Fecha às" items={CLOSES} defaultValue={hours.closesAt} />
      </div>
    </Field>
  )
}
