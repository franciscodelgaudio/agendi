"use client"

import { AmountInput } from "@/components/shared/amount-input"
import { DayField } from "@/components/shared/day-field"
import { Field, FieldLabel } from "@/components/ui/field"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import type { OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance"

// Hoje no horário de Brasília.
function todayInBrasilia() {
  return new Date(Date.now() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Valor em caixa e o dia a partir do qual o saldo passa a somar o líquido; sem valor, fica sem saldo.
export function OpeningBalanceFields({
  idPrefix,
  defaultValue,
  label = "Saldo em caixa (opcional)",
  required,
  onAmountChange,
}: {
  idPrefix: string
  defaultValue?: OpeningBalance | null
  label?: string
  required?: boolean
  onAmountChange?: (cents: number | null) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-opening-balance`}>{label}</FieldLabel>
        <AmountInput
          id={`${idPrefix}-opening-balance`}
          name="openingBalance"
          max={100_000_000}
          placeholder="R$ 0,00"
          defaultValue={defaultValue?.amountCents}
          onValueChange={onAmountChange}
          required={required}
        />
      </Field>
      <DayField
        id={`${idPrefix}-opening-balance-date`}
        name="openingBalanceDate"
        label="Em"
        defaultValue={defaultValue?.date ?? todayInBrasilia()}
      />
    </div>
  )
}
