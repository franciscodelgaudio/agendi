"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createChannelAction, type MessagingActionState } from "@/lib/actions/messaging"

import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { ChannelFields } from "@/components/workspace/[workspaceId]/channels/channel-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateChannelSheet({ workspaceId }: { workspaceId: string }) {
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
      <SheetTrigger data-tour="create-channel" render={<Button />}>
        <PlusIcon />
        Conectar canal
      </SheetTrigger>
      <SheetContent>
        <CreateChannelForm key={formKey} workspaceId={workspaceId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function CreateChannelForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: MessagingActionState, formData: FormData) => {
      const next = await createChannelAction(workspaceId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Conectar canal</SheetTitle>
        <SheetDescription>Número do WhatsApp Business ou conta do Instagram.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ChannelFields idPrefix="create-channel" />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Conectando..." : "Conectar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
