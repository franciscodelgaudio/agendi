"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { cadastrarClienteAction, type ClienteActionState } from "@/contextos/clientes/acoes"

import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { CustomerFields } from "@/components/workspace/[workspaceId]/customers/customer-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateCustomerSheet({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário vazio e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Cadastrar cliente
      </SheetTrigger>
      <SheetContent>
        <CreateCustomerForm key={formKey} workspaceId={workspaceId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function CreateCustomerForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ClienteActionState, formData: FormData) => {
      const next = await cadastrarClienteAction(workspaceId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Cadastrar cliente</SheetTitle>
        <SheetDescription>Cadastre o cliente uma vez e encontre-o depois pelo nome ou CPF.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <CustomerFields idPrefix="create-customer" />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Cadastrando..." : "Cadastrar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
