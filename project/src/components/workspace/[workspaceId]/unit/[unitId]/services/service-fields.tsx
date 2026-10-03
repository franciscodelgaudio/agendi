"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/shared/amount-input"
import { ProductPicker } from "@/components/workspace/[workspaceId]/shared/stock/product-picker"

// Serviços cadastrados antes de requiresTherapist/treatmentRoomIds não os têm: exigem profissional e
// aceitam qualquer espaço.
export type ServiceFieldValues = {
  name: string
  priceCents: number
  durationMinutes: number
  productIds: string[]
  requiresTherapist?: boolean
  treatmentRoomIds?: string[]
}

// Espaços da unidade, para limitar onde o serviço pode ser feito.
export type ServiceRoomOption = { id: string; name: string }

type Props = {
  idPrefix: string
  treatmentRooms: ServiceRoomOption[]
  defaultValues?: ServiceFieldValues
}

// Os produtos padrão são buscados na unidade da URL.
export function ServiceFields({ idPrefix, treatmentRooms, defaultValues }: Props) {
  const [productIds, setProductIds] = useState(defaultValues?.productIds ?? [])
  const [requiresTherapist, setRequiresTherapist] = useState(defaultValues?.requiresTherapist ?? true)
  const [roomIds, setRoomIds] = useState(defaultValues?.treatmentRoomIds ?? [])

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
        <Field orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-requires-therapist`}
            checked={requiresTherapist}
            onCheckedChange={(next) => setRequiresTherapist(next === true)}
          />
          <FieldLabel htmlFor={`${idPrefix}-requires-therapist`} className="font-normal">
            Precisa de profissional
          </FieldLabel>
        </Field>
        <input type="hidden" name="requiresTherapist" value={String(requiresTherapist)} />
        <FieldDescription>
          Desmarque em serviços como hidromassagem: o agendamento não pede profissional e não gera comissão.
        </FieldDescription>
      </Field>
      {treatmentRooms.length > 1 && (
        <FieldSet>
          <FieldLegend variant="label">Espaços (opcional)</FieldLegend>
          <div className="flex flex-col gap-2">
            {treatmentRooms.map((room) => (
              <Field key={room.id} orientation="horizontal">
                <Checkbox
                  id={`${idPrefix}-room-${room.id}`}
                  name="treatmentRoomId"
                  value={room.id}
                  checked={roomIds.includes(room.id)}
                  onCheckedChange={(next) =>
                    setRoomIds((current) =>
                      next === true ? [...current, room.id] : current.filter((id) => id !== room.id),
                    )
                  }
                />
                <FieldLabel htmlFor={`${idPrefix}-room-${room.id}`} className="min-w-0 font-normal">
                  <span className="truncate">{room.name}</span>
                </FieldLabel>
              </Field>
            ))}
          </div>
          <FieldDescription>Nenhum marcado: o serviço pode ser feito em qualquer espaço.</FieldDescription>
        </FieldSet>
      )}
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
