"use client"

import { useActionState, useState } from "react"
import { ArrowLeftRightIcon, PlusIcon } from "lucide-react"
import { registerMovementAction, transferProductAction, type InventoryFormState } from "@/lib/actions/inventory"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

type Option = { id: string; name: string }

const TYPE_ITEMS = [
  { value: "in", label: "Entrada" },
  { value: "out", label: "Saída" },
]

function OptionSelect({
  id,
  name,
  label,
  placeholder,
  options,
  defaultValue,
}: {
  id: string
  name: string
  label: string
  placeholder: string
  options: Option[]
  defaultValue?: string
}) {
  const items = options.map((option) => ({ value: option.id, label: option.name }))
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select name={name} items={items} defaultValue={defaultValue ?? null} required>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
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
  )
}

function QuantityField({ id }: { id: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Quantidade</FieldLabel>
      <Input id={id} name="quantity" type="number" inputMode="numeric" min={1} max={1_000_000} step={1} required />
    </Field>
  )
}

export function MovementSheet({
  workspaceId,
  inventoryId,
  products,
}: {
  workspaceId: string
  inventoryId: string
  products: Option[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: InventoryFormState, formData: FormData) => {
      const next = await registerMovementAction(workspaceId, inventoryId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Entrada ou saída
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Entrada ou saída</SheetTitle>
            <SheetDescription>Soma ou tira a quantidade de um produto neste inventário.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <OptionSelect
              id="movement-type"
              name="type"
              label="Tipo"
              placeholder="Escolha o tipo"
              options={TYPE_ITEMS.map((item) => ({ id: item.value, name: item.label }))}
              defaultValue="in"
            />
            <OptionSelect id="movement-product" name="productId" label="Produto" placeholder="Escolha o produto" options={products} />
            <QuantityField id="movement-quantity" />
            <Field>
              <FieldLabel htmlFor="movement-name">Descrição (opcional)</FieldLabel>
              <Input id="movement-name" name="name" placeholder="Compra do fornecedor" maxLength={80} />
            </Field>
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Registrando..." : "Registrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function TransferSheet({
  workspaceId,
  inventoryId,
  products,
  inventories,
}: {
  workspaceId: string
  inventoryId: string
  products: Option[]
  inventories: Option[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: InventoryFormState, formData: FormData) => {
      const next = await transferProductAction(workspaceId, inventoryId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        <ArrowLeftRightIcon />
        Transferir
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Transferir produto</SheetTitle>
            <SheetDescription>Tira daqui e põe em outro inventário.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <OptionSelect id="transfer-product" name="productId" label="Produto" placeholder="Escolha o produto" options={products} />
            <QuantityField id="transfer-quantity" />
            <OptionSelect
              id="transfer-target"
              name="toInventoryId"
              label="Para"
              placeholder="Escolha o inventário"
              options={inventories}
            />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Transferindo..." : "Transferir"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
