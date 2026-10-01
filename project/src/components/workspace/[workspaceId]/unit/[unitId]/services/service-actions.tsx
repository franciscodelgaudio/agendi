"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { deleteServiceAction, updateServiceAction, type ServiceActionState } from "@/lib/actions/service"

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
import { ServiceFields } from "@/components/workspace/[workspaceId]/unit/[unitId]/services/service-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Service = { id: string; name: string; priceCents: number; durationMinutes: number; productIds: string[] }

type Props = { workspaceId: string; unitId: string; service: Service }

export function ServiceActions({ workspaceId, unitId, service }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${service.name}`} />}
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
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <EditServiceForm
            key={editKey}
            workspaceId={workspaceId}
            unitId={unitId}
            service={service}
           
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <DeleteServiceDialog
        workspaceId={workspaceId}
        unitId={unitId}
        service={service}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

function EditServiceForm({ workspaceId, unitId, service, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ServiceActionState, formData: FormData) => {
      const next = await updateServiceAction(workspaceId, unitId, service.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar serviço</SheetTitle>
        <SheetDescription>Altere os dados deste serviço.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ServiceFields idPrefix={`edit-service-${service.id}`} defaultValues={service} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function DeleteServiceDialog({
  workspaceId,
  unitId,
  service,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteServiceAction(workspaceId, unitId, service.id)
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
          <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
          <AlertDialogDescription>
            O serviço <strong>{service.name}</strong> será excluído permanentemente. Essa ação não pode ser desfeita.
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
