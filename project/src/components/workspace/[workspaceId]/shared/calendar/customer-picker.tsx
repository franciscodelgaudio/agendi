"use client"

import { useEffect, useState } from "react"
import { searchCustomersAction, type CustomerOption } from "@/lib/actions/appointment"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const SEARCH_DELAY_MS = 250

type RegisteredOption = { id: string; name: string }

export type PickedCustomer =
  | { kind: "registered"; customerId: string; name: string }
  | { kind: "guest"; name: string; observation: string | null }

export function CustomerPicker({
  workspaceId,
  defaultValue,
}: {
  workspaceId: string
  defaultValue: PickedCustomer | null
}) {
  const [picked, setPicked] = useState<RegisteredOption | null>(
    defaultValue?.kind === "registered" ? { id: defaultValue.customerId, name: defaultValue.name } : null,
  )
  const [query, setQuery] = useState(defaultValue?.name ?? "")
  const [observation, setObservation] = useState(defaultValue?.kind === "guest" ? (defaultValue.observation ?? "") : "")
  const [save, setSave] = useState(false)
  const [cellphone, setCellphone] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<{ key: string; customers: CustomerOption[] }>({ key: "", customers: [] })
  const loading = results.key !== query
  const name = query.trim()
  const guest = !picked && !!name

  useEffect(() => {
    if (!open || !name) return
    let ignore = false
    const timer = setTimeout(async () => {
      const customers = await searchCustomersAction(workspaceId, query)
      if (!ignore) setResults({ key: query, customers })
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [workspaceId, open, query, name])

  return (
    <Field>
      <FieldLabel htmlFor="appointment-customer">Cliente</FieldLabel>
      <Combobox
        items={name ? results.customers : []}
        filter={null}
        value={picked}
        onValueChange={(next: RegisteredOption | null) => {
          setPicked(next && { id: next.id, name: next.name })
          if (next) setQuery(next.name)
        }}
        inputValue={query}
        onInputValueChange={(next, { reason }) => {
          if (reason === "input-clear") return
          setQuery(next)
          if (picked && next !== picked.name) setPicked(null)
        }}
        open={open && !!name}
        onOpenChange={setOpen}
        itemToStringLabel={(customer: RegisteredOption) => customer.name}
        isItemEqualToValue={(a: RegisteredOption, b: RegisteredOption) => a.id === b.id}
      >
        <ComboboxInput id="appointment-customer" placeholder="Nome ou celular" className="w-full" />
        <ComboboxContent>
          <ComboboxEmpty>{loading ? "Buscando..." : "Nenhum cliente cadastrado com esse nome. Fica sem cadastro."}</ComboboxEmpty>
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
      <FieldDescription>
        {picked ? "Cliente cadastrado." : guest ? "Sem cadastro." : "Opcional. Digite para buscar clientes cadastrados."}
      </FieldDescription>

      {guest && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="appointment-save-customer" checked={save} onCheckedChange={(checked) => setSave(checked === true)} />
            <Label htmlFor="appointment-save-customer" className="font-normal">
              Salvar como cliente
            </Label>
          </div>
          {save && (
            <Input
              aria-label="Celular do cliente"
              type="tel"
              inputMode="tel"
              placeholder="Celular (opcional)"
              value={cellphone}
              onChange={(e) => setCellphone(e.target.value)}
              maxLength={20}
            />
          )}
          <Textarea
            aria-label="Observação sobre o cliente"
            placeholder="Observação (opcional)"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            maxLength={1000}
          />
        </div>
      )}

      <input type="hidden" name="customerKind" value={picked ? "registered" : guest ? "guest" : ""} />
      <input type="hidden" name="customerId" value={picked?.id ?? ""} />
      <input type="hidden" name="customerName" value={guest ? name : ""} />
      <input type="hidden" name="customerObservation" value={guest ? observation : ""} />
      <input type="hidden" name="saveCustomer" value={guest && save ? "on" : ""} />
      <input type="hidden" name="customerCellphone" value={guest && save ? cellphone : ""} />
    </Field>
  )
}
