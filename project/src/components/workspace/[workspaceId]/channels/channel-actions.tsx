"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { deleteChannelAction, updateChannelAction, type MessagingActionState } from "@/lib/actions/messaging"
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { ChannelFields } from "@/components/workspace/[workspaceId]/channels/channel-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Channel = { id: string; name: string; platform: MessagingPlatform; externalId: string }

type Props = { workspaceId: string; channel: Channel }

export function ChannelActions({ workspaceId, channel }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${channel.name}`} />}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Remover
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <EditChannelForm key={editKey} workspaceId={workspaceId} channel={channel} onDone={() => setEditOpen(false)} />
        </SheetContent>
      </Sheet>

      <DeleteChannelDialog workspaceId={workspaceId} channel={channel} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}

function EditChannelForm({ workspaceId, channel, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: MessagingActionState, formData: FormData) => {
      const next = await updateChannelAction(workspaceId, channel.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar canal</SheetTitle>
        <SheetDescription>Altere o nome ou troque o token de acesso.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ChannelFields idPrefix={`edit-channel-${channel.id}`} channel={channel} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function DeleteChannelDialog({
  workspaceId,
  channel,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteChannelAction(workspaceId, channel.id)
      setError(result.error)
      if (!result.error) onOpenChange(false)
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover canal?</AlertDialogTitle>
          <AlertDialogDescription>
            O canal <strong>{channel.name}</strong> e todas as conversas dele serão excluídos permanentemente. Essa
            ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} loading={pending}>
            {pending ? "Removendo..." : "Remover"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
