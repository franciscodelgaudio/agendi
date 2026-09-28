"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { EllipsisIcon, PauseIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react"
import Link from "@/components/link"
import { deleteUraAction, setUraActiveAction } from "@/lib/actions/ura"

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
import { FieldError } from "@/components/ui/field"

type Props = { workspaceId: string; ura: { id: string; name: string; active: boolean } }

export function UraActions({ workspaceId, ura }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await setUraActiveAction(workspaceId, ura.id, !ura.active)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${ura.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem render={<Link href={`/workspace/${workspaceId}/uras/${ura.id}`} />}>
            <PencilIcon />
            Editar fluxo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggle}>
            {ura.active ? <PauseIcon /> : <PlayIcon />}
            {ura.active ? "Desativar" : "Ativar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteUraDialog workspaceId={workspaceId} ura={ura} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}

function DeleteUraDialog({
  workspaceId,
  ura,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUraAction(workspaceId, ura.id)
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
          <AlertDialogTitle>Excluir URA?</AlertDialogTitle>
          <AlertDialogDescription>
            A URA <strong>{ura.name}</strong> será excluída e os atendimentos em andamento dela param. Essa ação não pode
            ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} loading={pending}>
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
