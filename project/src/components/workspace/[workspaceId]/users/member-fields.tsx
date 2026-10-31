"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type RoleOption = { id: string; name: string; admin: boolean }

export type RoleChoices = { roles: RoleOption[]; allowAdmin: boolean }

export function RoleSelect({
  id,
  choices,
  value,
  onValueChange,
  disabled,
  lockAdmin,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  choices: RoleChoices
  value: string | null
  onValueChange: (value: string) => void
  disabled?: boolean
  lockAdmin?: boolean
  className?: string
  "aria-label"?: string
}) {
  const items = choices.roles.map((role) => ({
    value: role.id,
    label: role.name,
    disabled: (role.admin && !choices.allowAdmin) || (!!lockAdmin && !role.admin),
  }))

  return (
    <Select
      name="roleId"
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
      disabled={disabled}
      required
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className ?? "w-full"}>
        <SelectValue placeholder="Escolha uma função" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
