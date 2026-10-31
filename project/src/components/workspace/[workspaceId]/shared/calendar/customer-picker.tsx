"use client"

import { useEffect, useState, useTransition } from "react"
import { UserPlusIcon } from "lucide-react"
import { searchCustomersAction, type CustomerOption } from "@/lib/actions/appointment"
import { createCustomerAction } from "@/lib/actions/customer"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const SEARCH_DELAY_MS = 250

export type PickedCustomer = { id: string; name: string }

export function CustomerPicker({
  workspaceId,
  defaultValue,
}: {
  workspaceId: string
  defaultValue: PickedCustomer | null
}) {
  const [value, setValue] = useState<PickedCustomer | null>(defaultValue)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ key: string; customers: CustomerOption[] }>({ key: "", customers: [] })
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCellphone, setNewCellphone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const loading = results.key !== query

  useEffect(() => {
    if (!open) return
    let ignore = false
    const timer = setTimeout(async () => {
      const customers = await searchCustomersAction(workspaceId, query)
      if (!ignore) setResults({ key: query, customers })
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [workspaceId, open, query])

  function saveNew() {
    startSaving(async () => {
      const formData = new FormData()
      formData.set("name", newName)
      formData.set("cellphone", newCellphone)
      const result = await createCustomerAction(workspaceId, { error: null }, formData)
      setError(result.error)
      if (result.error || !result.customerId) return
      setValue({ id: result.customerId, name: newName.trim() })
      setCreating(false)
      setNewName("")
      setNewCellphone("")
    })
  }

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="appointment-customer">Cliente</FieldLabel>
        {!creating && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setCreating(true)}>
            <UserPlusIcon />
            Novo cliente
          </Button>
        )}
      </div>
      {creating ? (
        <div className="grid gap-2 rounded-md border p-3">
          <Input
            aria-label="Nome do cliente novo"
            placeholder="Nome"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={120}
          />
          <Input
            aria-label="Celular do cliente novo"
            type="tel"
            inputMode="tel"
            placeholder="Celular (opcional)"
            value={newCellphone}
            onChange={(e) => setNewCellphone(e.target.value)}
            maxLength={20}
          />
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={saveNew} loading={saving}>
              Cadastrar
            </Button>
          </div>
        </div>
      ) : (
        <Combobox
          items={results.customers}
          filter={null}
          value={value}
          onValueChange={(next: PickedCustomer | null) => setValue(next && { id: next.id, name: next.name })}
          inputValue={open ? query : (value?.name ?? query)}
          onInputValueChange={setQuery}
          open={open}
          onOpenChange={setOpen}
          itemToStringLabel={(customer: PickedCustomer) => customer.name}
          isItemEqualToValue={(a: PickedCustomer, b: PickedCustomer) => a.id === b.id}
        >
          <ComboboxInput id="appointment-customer" placeholder="Buscar cliente..." className="w-full" />
          <ComboboxContent>
            <ComboboxEmpty>{loading ? "Buscando..." : "Nenhum cliente encontrado."}</ComboboxEmpty>
            <ComboboxList>
              {(customer: CustomerOption) => (
                <ComboboxItem key={customer.id} value={customer}>
                  <span className="truncate">{customer.name}</span>
                  {customer.cellphone && <span className="ml-auto text-xs text-muted-foreground">{customer.cellphone}</span>}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      <input type="hidden" name="customerId" value={value?.id ?? ""} />
    </Field>
  )
}
