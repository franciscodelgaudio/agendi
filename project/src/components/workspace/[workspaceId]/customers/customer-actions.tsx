"use client"

import { useActionState, useState } from "react"
import { EllipsisIcon, PencilIcon } from "lucide-react"
import { atualizarClienteAction, type ClienteActionState } from "@/contextos/clientes/acoes"
import type { ClienteDaLista } from "@/contextos/clientes/consultas"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { CustomerFields } from "@/components/workspace/[workspaceId]/customers/customer-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Sem exclusão: a remoção do cliente será a anonimização da LGPD.
export function CustomerActions({ workspaceId, customer }: { workspaceId: string; customer: ClienteDaLista }) {
  const [editOpen, setEditOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${customer.nome}`} />}
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <EditCustomerForm
            key={editKey}
            workspaceId={workspaceId}
            customer={customer}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

function EditCustomerForm({
  workspaceId,
  customer,
  onDone,
}: {
  workspaceId: string
  customer: ClienteDaLista
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ClienteActionState, formData: FormData) => {
      const next = await atualizarClienteAction(workspaceId, customer.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar cliente</SheetTitle>
        <SheetDescription>Altere os dados deste cliente.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <CustomerFields idPrefix={`edit-customer-${customer.id}`} defaultValues={customer} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
