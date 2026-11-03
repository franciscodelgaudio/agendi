"use client"

import { useActionState, useState } from "react"
import { MapPinIcon } from "lucide-react"
import { setInventoryUnitsAction, type InventoryFormState } from "@/lib/actions/inventory"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { InventoryUnitOption } from "@/service/workspace/[workspaceId]/stock/stock-unit-store"

export type { InventoryUnitOption }

type Props = {
  workspaceId: string
  inventory: { id: string; name: string }
  units: InventoryUnitOption[]
}

function InventoryUnitsForm({ workspaceId, inventory, units, onDone }: Props & { onDone: () => void }) {
  const [checked, setChecked] = useState(() => units.filter((unit) => unit.inventoryId === inventory.id).map((unit) => unit.id))
  const [state, formAction, pending] = useActionState(
    async (prev: InventoryFormState, formData: FormData) => {
      const next = await setInventoryUnitsAction(workspaceId, inventory.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Unidades de {inventory.name}</SheetTitle>
        <SheetDescription>
          Marque as unidades que usam este estoque. Cada unidade usa um estoque só: marcar uma que usa outro faz ela trocar
          para este.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 gap-3 overflow-y-auto px-4 pb-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {checked.map((id) => (
          <input key={id} type="hidden" name="unitIds" value={id} />
        ))}
        {units.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>}
        {units.map((unit) => {
          const id = `inventory-${inventory.id}-unit-${unit.id}`
          const usesOther = unit.inventoryId !== null && unit.inventoryId !== inventory.id
          const isChecked = checked.includes(unit.id)
          return (
            <FieldLabel key={unit.id} htmlFor={id}>
              <Field orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={isChecked}
                  onCheckedChange={(next) =>
                    setChecked((list) => (next ? [...list, unit.id] : list.filter((item) => item !== unit.id)))
                  }
                />
                <FieldContent className="min-w-0">
                  <FieldTitle className="w-full truncate">{unit.name}</FieldTitle>
                  {usesOther && (
                    <FieldDescription className="truncate">
                      {isChecked ? `Deixa de usar ${unit.inventoryName}` : `Usa hoje: ${unit.inventoryName}`}
                    </FieldDescription>
                  )}
                  {!usesOther && unit.inventoryId === null && !isChecked && (
                    <FieldDescription>Sem estoque</FieldDescription>
                  )}
                </FieldContent>
              </Field>
            </FieldLabel>
          )
        })}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function InventoryUnitsSheet({
  open,
  onOpenChange,
  trigger,
  ...props
}: Props & { open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: boolean }) {
  const [ownOpen, setOwnOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const isOpen = open ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setFormKey((key) => key + 1)
        setOpen(next)
      }}
    >
      {trigger && (
        <SheetTrigger render={<Button variant="outline" />}>
          <MapPinIcon />
          Unidades
        </SheetTrigger>
      )}
      <SheetContent>
        <InventoryUnitsForm key={formKey} {...props} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
