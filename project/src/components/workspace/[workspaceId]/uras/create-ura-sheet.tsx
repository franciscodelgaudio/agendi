"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createUraAction, type UraActionState } from "@/lib/actions/ura"
import { MAX_URA_NAME_LENGTH } from "@/service/workspace/[workspaceId]/uras/ura"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateUraSheet({ workspaceId }: { workspaceId: string }) {
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
      <SheetTrigger data-tour="create-ura" render={<Button />}>
        <PlusIcon />
        Nova URA
      </SheetTrigger>
      <SheetContent>
        <CreateUraForm key={formKey} workspaceId={workspaceId} />
      </SheetContent>
    </Sheet>
  )
}

// Ao criar, a action redireciona para o editor.
function CreateUraForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: UraActionState, formData: FormData) => createUraAction(workspaceId, prev, formData),
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Nova URA</SheetTitle>
        <SheetDescription>Atendimento automático nas conversas.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="create-ura-name">Nome</FieldLabel>
          <Input id="create-ura-name" name="name" maxLength={MAX_URA_NAME_LENGTH} placeholder="Ex.: Boas-vindas e agendamento" required autoFocus />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Criando..." : "Criar e editar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
