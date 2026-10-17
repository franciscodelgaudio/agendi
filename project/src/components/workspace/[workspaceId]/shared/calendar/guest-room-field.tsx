"use client"

import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type Props = {
  idPrefix: string
  // Unidade dentro de um parceiro: quarto obrigatório, a não ser para cliente de fora.
  partner: boolean
  defaultRoom: string
  // Agendamento/atendimento já salvo em unidade com parceiro e sem quarto: cliente de fora.
  defaultOutsideGuest: boolean
}

// Quarto do cliente. Em espaço próprio é opcional; dentro de um parceiro é obrigatório, e
// "cliente de fora" tira o campo do formulário (o servidor salva o quarto vazio).
export function GuestRoomField({ idPrefix, partner, defaultRoom, defaultOutsideGuest }: Props) {
  const [room, setRoom] = useState(defaultRoom)
  const [outsideGuest, setOutsideGuest] = useState(defaultOutsideGuest)

  return (
    <>
      {!(partner && outsideGuest) && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-room`}>{partner ? "Quarto" : "Quarto (opcional)"}</FieldLabel>
          <Input
            id={`${idPrefix}-room`}
            name="room"
            placeholder="204"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            maxLength={20}
            required={partner}
          />
        </Field>
      )}
      {partner && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-outside-guest`}
            name="outsideGuest"
            value="on"
            checked={outsideGuest}
            onCheckedChange={(checked) => setOutsideGuest(checked === true)}
          />
          <FieldLabel htmlFor={`${idPrefix}-outside-guest`} className="font-normal">
            Cliente de fora (sem quarto)
          </FieldLabel>
        </Field>
      )}
    </>
  )
}
