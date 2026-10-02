"use client"

import { useState } from "react"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Quem pode pagar a compra: "wallet" (a carteira ligada ao estoque) ou o id de uma unidade dele.
export type PayerOption = { value: string; label: string }

// Campo "payer" dos formulários de compra. Com uma opção só, não aparece: paga a unidade da página.
export function PayerField({ id, payers }: { id: string; payers: PayerOption[] }) {
  const [payer, setPayer] = useState<string | null>(payers[0]?.value ?? null)
  if (payers.length < 2) return null

  return (
    <Field>
      <FieldLabel htmlFor={id}>Quem paga</FieldLabel>
      <Select name="payer" items={payers} value={payer} onValueChange={(value) => setPayer(value as string | null)} required>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Escolha quem paga" />
        </SelectTrigger>
        <SelectContent>
          {payers.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>A compra entra como despesa de quem paga, no grupo Insumos.</FieldDescription>
    </Field>
  )
}
