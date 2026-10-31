"use client"

import { useState } from "react"
import { OpeningBalanceFields } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
import { Field, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type RefOption = { id: string; name: string }

const NEW = "new"

function RefField({
  idPrefix,
  name,
  label,
  newLabel,
  newPlaceholder,
  options,
  defaultValue,
  withBalance,
}: {
  idPrefix: string
  name: "wallet" | "inventory"
  label: string
  newLabel: string
  newPlaceholder: string
  options: RefOption[]
  defaultValue?: string
  withBalance?: boolean
}) {
  const [value, setValue] = useState<string | null>(defaultValue ?? (options.length ? null : NEW))
  const items = [...options.map((option) => ({ value: option.id, label: option.name })), { value: NEW, label: newLabel }]

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
        <Select name={`${name}Id`} items={items} value={value} onValueChange={(next) => setValue(next as string)} required>
          <SelectTrigger id={`${idPrefix}-${name}`} className="w-full">
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value === NEW && (
        <>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-${name}-name`}>Nome</FieldLabel>
            <Input id={`${idPrefix}-${name}-name`} name={`${name}Name`} placeholder={newPlaceholder} maxLength={40} required />
          </Field>
          {withBalance && <OpeningBalanceFields idPrefix={`${idPrefix}-${name}`} />}
        </>
      )}
    </>
  )
}

export function UnitRefFields({
  idPrefix,
  wallets,
  inventories,
  defaultWalletId,
  defaultInventoryId,
}: {
  idPrefix: string
  wallets: RefOption[]
  inventories: RefOption[]
  defaultWalletId?: string
  defaultInventoryId?: string
}) {
  return (
    <>
      <FieldSeparator>Caixa e estoque</FieldSeparator>
      <RefField
        idPrefix={idPrefix}
        name="wallet"
        label="Carteira"
        newLabel="Nova carteira"
        newPlaceholder="Caixa Centro"
        options={wallets}
        defaultValue={defaultWalletId}
        withBalance
      />
      <RefField
        idPrefix={idPrefix}
        name="inventory"
        label="Inventário"
        newLabel="Novo inventário"
        newPlaceholder="Estoque Centro"
        options={inventories}
        defaultValue={defaultInventoryId}
      />
    </>
  )
}
