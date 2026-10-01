"use client"

import { useState } from "react"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/shared/amount-input"
import { ProductPicker } from "@/components/workspace/[workspaceId]/shared/stock/product-picker"

type Props = {
  idPrefix: string
  defaultValues?: { name: string; priceCents: number; durationMinutes: number; productIds: string[] }
}

// Os produtos padrão são buscados na unidade da URL.
export function ServiceFields({ idPrefix, defaultValues }: Props) {
  const [productIds, setProductIds] = useState(defaultValues?.productIds ?? [])

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Massagem Candle"
          defaultValue={defaultValues?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price`}>Valor</FieldLabel>
        <AmountInput
          id={`${idPrefix}-price`}
          name="price"
          max={100_000_000}
          placeholder="R$ 350,00"
          defaultValue={defaultValues?.priceCents}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-duration`}>Duração média (minutos)</FieldLabel>
        <Input
          id={`${idPrefix}-duration`}
          name="durationMinutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          step={1}
          placeholder="60"
          defaultValue={defaultValues?.durationMinutes}
          required
        />
      </Field>
      <Field>
        <FieldLabel>Produtos padrão (opcional)</FieldLabel>
        <ProductPicker
          value={productIds}
          onChange={setProductIds}
        />
        <FieldDescription>Já vêm marcados ao escolher este serviço num agendamento ou atendimento.</FieldDescription>
      </Field>
    </>
  )
}
