"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatCpf, formatPhone } from "@/components/workspace/[workspaceId]/customers/customer-format"

const MAX_PHONES = 5

type Props = {
  idPrefix: string
  defaultValues?: {
    nome: string
    cpf: string
    telefones: string[]
    email: string | null
    observacoes: string | null
  }
}

type PhoneRow = { key: number; value: string }

function toRows(phones: string[] | undefined): PhoneRow[] {
  if (!phones?.length) return [{ key: 0, value: "" }]
  return phones.map((phone, key) => ({ key, value: formatPhone(phone) }))
}

export function CustomerFields({ idPrefix, defaultValues }: Props) {
  const [phones, setPhones] = useState(() => toRows(defaultValues?.telefones))

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Maria da Silva"
          defaultValue={defaultValues?.nome}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-cpf`}>CPF</FieldLabel>
        <Input
          id={`${idPrefix}-cpf`}
          name="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          defaultValue={defaultValues ? formatCpf(defaultValues.cpf) : undefined}
          maxLength={14}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-phone-${phones[0].key}`}>Telefones (opcional)</FieldLabel>
        <div className="divide-y border">
          {phones.map((row, index) => (
            <div key={row.key} className="flex items-center gap-2 p-3">
              <Input
                id={`${idPrefix}-phone-${row.key}`}
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="(11) 98765-4321"
                aria-label={`Telefone ${index + 1}`}
                value={row.value}
                onChange={(e) =>
                  setPhones((current) => current.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))
                }
                maxLength={20}
              />
              {phones.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover telefone ${index + 1}`}
                  onClick={() => setPhones((current) => current.filter((r) => r.key !== row.key))}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
          {phones.length < MAX_PHONES && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() =>
                setPhones((current) => [...current, { key: Math.max(...current.map((r) => r.key)) + 1, value: "" }])
              }
            >
              <PlusIcon />
              Adicionar telefone
            </Button>
          )}
        </div>
        <FieldDescription>Com DDD. Até {MAX_PHONES} telefones.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-email`}>E-mail (opcional)</FieldLabel>
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          placeholder="maria@exemplo.com"
          defaultValue={defaultValues?.email ?? undefined}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Observações (opcional)</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          placeholder="Preferências, como prefere ser chamada..."
          defaultValue={defaultValues?.observacoes ?? undefined}
          maxLength={500}
        />
        <FieldDescription>Não registre dados de saúde aqui.</FieldDescription>
      </Field>
    </>
  )
}
