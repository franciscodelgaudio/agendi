"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createTicketAction, type TicketActionState } from "@/lib/actions/ticket"
import { TICKET_TYPES } from "@/service/workspace/[workspaceId]/tickets/ticket"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ticketTypeLabels, TicketTypeIcon } from "@/components/workspace/[workspaceId]/tickets/ticket-labels"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const typeItems = TICKET_TYPES.map((type) => ({ value: type, label: ticketTypeLabels[type] }))

export function CreateTicketSheet({ workspaceId }: { workspaceId: string }) {
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
        Novo ticket
      </SheetTrigger>
      <SheetContent>
        <CreateTicketForm key={formKey} workspaceId={workspaceId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function CreateTicketForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: TicketActionState, formData: FormData) => {
      const next = await createTicketAction(workspaceId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Novo ticket</SheetTitle>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="create-ticket-type">Tipo</FieldLabel>
          <Select name="type" items={typeItems} defaultValue="bug" required>
            <SelectTrigger id="create-ticket-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <TicketTypeIcon type={item.value} />
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="create-ticket-title">Título</FieldLabel>
          <Input id="create-ticket-title" name="title" maxLength={120} autoFocus required />
        </Field>
        <Field>
          <FieldLabel htmlFor="create-ticket-description">Descrição</FieldLabel>
          <Textarea id="create-ticket-description" name="description" maxLength={5000} className="min-h-32" required />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Enviando..." : "Enviar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
