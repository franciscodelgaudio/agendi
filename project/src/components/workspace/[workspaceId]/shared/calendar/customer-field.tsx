"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ContactIcon, XIcon } from "lucide-react"
import { buscarClientesAction } from "@/contextos/clientes/acoes"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatCpf } from "@/components/workspace/[workspaceId]/customers/customer-format"

// cpf ausente: cliente vindo de um registro salvo, que só traz o id e o nome.
type CustomerOption = { id: string; name: string; cpf?: string }

type Props = {
  idPrefix: string
  // Nome salvo no registro (ou vazio num novo).
  defaultGuestName: string
  // Cliente recorrente do registro; null: avulso.
  defaultCustomerId: string | null
  autoFocus?: boolean
}

// Espera o usuário parar de digitar antes de buscar no servidor.
const SEARCH_DELAY_MS = 250

// Cliente do agendamento/atendimento. Avulso: o nome digitado (guestName). Cadastrado: um cliente
// de Clientes, escolhido pela busca por nome ou CPF e enviado em customerId; o servidor grava o
// nome do cadastro, então o guestName que vai junto é só o nome mostrado.
export function CustomerField({ idPrefix, defaultGuestName, defaultCustomerId, autoFocus }: Props) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [registered, setRegistered] = useState(!!defaultCustomerId)
  const [guestName, setGuestName] = useState(defaultGuestName)
  const [customer, setCustomer] = useState<CustomerOption | null>(
    defaultCustomerId ? { id: defaultCustomerId, name: defaultGuestName } : null,
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Resultados da última busca concluída e a busca a que se referem.
  const [results, setResults] = useState<{ key: string | null; customers: CustomerOption[] }>({
    key: null,
    customers: [],
  })

  const loading = results.key !== query
  useEffect(() => {
    if (!registered || customer || !open) return
    let ignore = false
    const timer = setTimeout(async () => {
      const found = await buscarClientesAction(workspaceId, query)
      if (ignore) return
      setResults({ key: query, customers: found.map(({ id, nome, cpf }) => ({ id, name: nome, cpf })) })
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [workspaceId, registered, customer, open, query])

  const kinds = [
    { registered: false, label: "Avulso" },
    { registered: true, label: "Cadastrado" },
  ]

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={!registered ? `${idPrefix}-guest-name` : customer ? undefined : `${idPrefix}-customer`}>
          Cliente
        </FieldLabel>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Tipo de cliente">
          {kinds.map((kind) => (
            <Button
              key={kind.label}
              type="button"
              size="sm"
              variant={registered === kind.registered ? "secondary" : "ghost"}
              className="h-7"
              aria-pressed={registered === kind.registered}
              onClick={() => {
                // Ao passar para Cadastrado, o nome já digitado vira a busca, com os resultados abertos.
                if (kind.registered && !registered && !customer) {
                  setQuery(guestName.trim())
                  setOpen(true)
                }
                setRegistered(kind.registered)
              }}
            >
              {kind.label}
            </Button>
          ))}
        </div>
      </div>
      {!registered ? (
        <Input
          id={`${idPrefix}-guest-name`}
          name="guestName"
          placeholder="João Silva"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={80}
          autoFocus={autoFocus}
          required
        />
      ) : customer ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5">
          <input type="hidden" name="customerId" value={customer.id} />
          <input type="hidden" name="guestName" value={customer.name} />
          <ContactIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="grid min-w-0 flex-1 text-sm leading-tight">
            <span className="truncate font-medium">{customer.name}</span>
            {customer.cpf && (
              <span className="truncate text-xs text-muted-foreground tabular-nums">CPF {formatCpf(customer.cpf)}</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Trocar cliente"
            title="Trocar cliente"
            onClick={() => {
              setCustomer(null)
              setQuery("")
              setOpen(true)
            }}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <Combobox
          items={results.customers}
          filter={null}
          value={null}
          onValueChange={(next: CustomerOption | null) => {
            if (!next) return
            setCustomer(next)
            setOpen(false)
          }}
          inputValue={query}
          onInputValueChange={setQuery}
          open={open}
          onOpenChange={setOpen}
          itemToStringLabel={(option: CustomerOption) => option.name}
          isItemEqualToValue={(a: CustomerOption, b: CustomerOption) => a.id === b.id}
        >
          <ComboboxInput
            id={`${idPrefix}-customer`}
            placeholder="Buscar por nome ou CPF..."
            className="w-full"
            // Aparece depois de escolher Cadastrado ou de trocar o cliente: já pronto para digitar.
            autoFocus
            // Sem cliente escolhido, o formulário não envia: o nome viria vazio.
            ref={(input: HTMLInputElement | null) => input?.setCustomValidity("Escolha um cliente da lista ou use Avulso.")}
          />
          <ComboboxContent>
            <ComboboxEmpty>{loading ? "Buscando..." : "Nenhum cliente encontrado."}</ComboboxEmpty>
            <ComboboxList>
              {(option: CustomerOption) => (
                <ComboboxItem key={option.id} value={option}>
                  <span className="truncate">{option.name}</span>
                  {option.cpf && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatCpf(option.cpf)}
                    </span>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
    </Field>
  )
}
