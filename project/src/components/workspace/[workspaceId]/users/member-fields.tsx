"use client"

import { useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type RoleOption = { id: string; name: string; admin: boolean }

export type RoleChoices = { roles: RoleOption[]; allowAdmin: boolean }

export function RoleField({
  idPrefix,
  choices,
  defaultValue,
}: {
  idPrefix: string
  choices: RoleChoices
  defaultValue?: string
}) {
  const roleItems = choices.roles
    .filter((role) => choices.allowAdmin || !role.admin)
    .map((role) => ({ value: role.id, label: role.name }))
  const [initialValue] = useState(defaultValue ?? null)

  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-role`}>Função</FieldLabel>
      <Select name="roleId" items={roleItems} defaultValue={initialValue} required>
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
