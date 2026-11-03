"use client"

import { useActionState, useRef, useState } from "react"
import { MapPinIcon } from "lucide-react"
import { setInventoryUnitsAction, type InventoryFormState } from "@/lib/actions/inventory"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { InventoryUnitOption } from "@/service/workspace/[workspaceId]/stock/stock-unit-store"

export type { InventoryUnitOption }

type Props = {
  workspaceId: string
  inventory: { id: string; name: string }
  units: InventoryUnitOption[]
}

function selectionLabel(selected: InventoryUnitOption[]) {
  if (selected.length === 0) return "Escolha as unidades"
  if (selected.length <= 2) return selected.map((unit) => unit.name).join(", ")
  return `${selected.length} unidades`
}

function InventoryUnitsForm({ workspaceId, inventory, units, onDone }: Props & { onDone: () => void }) {
  const [selected, setSelected] = useState(() => units.filter((unit) => unit.inventoryId === inventory.id))
  const anchorRef = useRef<HTMLDivElement>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: InventoryFormState, formData: FormData) => {
      const next = await setInventoryUnitsAction(workspaceId, inventory.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const moving = selected.filter((unit) => unit.inventoryId !== null && unit.inventoryId !== inventory.id)

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Unidades de {inventory.name}</SheetTitle>
        <SheetDescription>
          Escolha as unidades que usam este estoque. Cada unidade usa um estoque só: escolher uma que usa outro faz ela
          trocar para este.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {selected.map((unit) => (
          <input key={unit.id} type="hidden" name="unitIds" value={unit.id} />
        ))}
        <Field>
          <FieldLabel>Unidades</FieldLabel>
          {units.length === 0 ? (
            <FieldDescription>Nenhuma unidade cadastrada.</FieldDescription>
          ) : (
            <Combobox
              multiple
              items={units}
              value={selected}
              onValueChange={setSelected}
              itemToStringLabel={(unit: InventoryUnitOption) => unit.name}
              isItemEqualToValue={(a: InventoryUnitOption, b: InventoryUnitOption) => a.id === b.id}
            >
              <div ref={anchorRef}>
                <ComboboxTrigger render={<Button variant="outline" className="w-full justify-between font-normal" />}>
                  <span className={selected.length ? "truncate" : "truncate text-muted-foreground"}>
                    {selectionLabel(selected)}
                  </span>
                </ComboboxTrigger>
              </div>
              <ComboboxContent anchor={anchorRef}>
                <ComboboxInput showTrigger={false} placeholder="Buscar unidade..." />
                <ComboboxEmpty>Nenhuma unidade encontrada.</ComboboxEmpty>
                <ComboboxList>
                  {(unit: InventoryUnitOption) => (
                    <ComboboxItem key={unit.id} value={unit}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{unit.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {unit.inventoryId === null
                            ? "Sem estoque"
                            : unit.inventoryId === inventory.id
                              ? "Usa este estoque"
                              : `Usa ${unit.inventoryName}`}
                        </span>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
          {moving.length > 0 && (
            <FieldDescription>
              {moving.map((unit) => `${unit.name} deixa de usar ${unit.inventoryName}`).join(". ")}.
            </FieldDescription>
          )}
        </Field>
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
