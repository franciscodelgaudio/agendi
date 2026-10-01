"use client"

import { useState } from "react"
import { ADMIN_ROLE_NAME } from "@/lib/permissions"
import type { RoleOption } from "@/lib/unit-team"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Opções de função de um membro: as roles do workspace e, para quem é administrador,
// "Administrador" (valor "admin"), que só um administrador atribui.
export type RoleChoices = { roles: RoleOption[]; allowAdmin: boolean }

// defaultValue: "admin", o id da role ou null (membro ainda sem role).
export function RoleField({
  idPrefix,
  choices,
  defaultValue,
}: {
  idPrefix: string
  choices: RoleChoices
  defaultValue?: string | null
}) {
  const roleItems = [
    ...(choices.allowAdmin ? [{ value: "admin", label: ADMIN_ROLE_NAME }] : []),
    ...choices.roles.map((role) => ({ value: role.id, label: role.name })),
  ]
  // Congela o valor inicial: após salvar, a revalidação traz o papel novo antes do Sheet fechar,
  // e o Select não controlado da Base UI avisa se o defaultValue mudar depois de montado.
  const [initialValue] = useState(defaultValue ?? null)

  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-role`}>Função</FieldLabel>
      <Select name="role" items={roleItems} defaultValue={initialValue} required>
        <SelectTrigger id={`${idPrefix}-role`} className="w-full">
          <SelectValue placeholder="Escolha uma função" />
        </SelectTrigger>
        <SelectContent>
          {roleItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function MemberNameField({ idPrefix, defaultValue }: { idPrefix: string; defaultValue: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
      <Input
        id={`${idPrefix}-name`}
        name="name"
        defaultValue={defaultValue}
        maxLength={80}
        autoFocus
        required
      />
    </Field>
  )
}
