"use client"

import { useActionState, useState } from "react"
import { UserPlusIcon } from "lucide-react"
import { inviteMemberAction, type MemberFormState } from "@/lib/actions/member"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RoleField } from "@/components/member-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function InviteMemberSheet({ workspaceId }: { workspaceId: string }) {
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
      <SheetTrigger data-tour="invite-member" render={<Button />}>
        <UserPlusIcon />
        Convidar usuário
      </SheetTrigger>
      <SheetContent>
        <InviteMemberForm key={formKey} workspaceId={workspaceId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function InviteMemberForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: MemberFormState, formData: FormData) => {
      const next = await inviteMemberAction(workspaceId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Convidar usuário</SheetTitle>
        <SheetDescription>
          A pessoa recebe um email com um link para entrar no workspace. O convite vale por 7 dias.
        </SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="invite-member-email">Email</FieldLabel>
          <Input
            id="invite-member-email"
            name="email"
            type="email"
            placeholder="maria@exemplo.com"
            autoFocus
            required
          />
          <FieldDescription>Ela precisa entrar ou se cadastrar com este email para aceitar.</FieldDescription>
        </Field>
        <RoleField idPrefix="invite-member" />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Enviando..." : "Enviar convite"}
        </Button>
      </SheetFooter>
    </form>
  )
}
