"use client"

import { AmountInput } from "@/components/shared/amount-input"
import { DayField } from "@/components/shared/day-field"
import { Field, FieldLabel } from "@/components/ui/field"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"

export function brtDay(date: Date) {
  return new Date(date.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function todayInBrasilia() {
  return brtDay(new Date())
}

export function OpeningBalanceFields({ idPrefix, label = "Saldo inicial (opcional)" }: { idPrefix: string; label?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-opening-balance`}>{label}</FieldLabel>
        <AmountInput id={`${idPrefix}-opening-balance`} name="openingBalance" max={100_000_000} placeholder="R$ 0,00" />
      </Field>
      <DayField id={`${idPrefix}-opening-balance-date`} name="openingBalanceDate" label="Em" defaultValue={todayInBrasilia()} />
    </div>
  )
}
