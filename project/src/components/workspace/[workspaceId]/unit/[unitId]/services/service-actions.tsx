"use client"

import { useActionState, useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, PencilIcon } from "lucide-react"
import {
  deactivateServiceAction,
  reactivateServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from "@/lib/actions/service"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldGroup } from "@/components/ui/field"
import {
  ServiceFields,
  type ServiceFieldValues,
  type ServiceRoomOption,
} from "@/components/workspace/[workspaceId]/unit/[unitId]/services/service-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Service = ServiceFieldValues & { id: string; active: boolean }

type Props = { workspaceId: string; unitId: string; service: Service; treatmentRooms: ServiceRoomOption[] }

export function ServiceActions({ workspaceId, unitId, service, treatmentRooms }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  // Desativado não aceita alteração: só reativar.
  if (!service.active) return <ReactivateServiceButton workspaceId={workspaceId} unitId={unitId} service={service} />

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
          <DropdownMenuItem variant="destructive" onClick={() => setDeactivateOpen(true)}>
            <ArchiveIcon />
            Desativar
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
            treatmentRooms={treatmentRooms}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <DeactivateServiceDialog
        workspaceId={workspaceId}
        unitId={unitId}
        service={service}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </>
  )
}

function EditServiceForm({ workspaceId, unitId, service, treatmentRooms, onDone }: Props & { onDone: () => void }) {
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
        <ServiceFields idPrefix={`edit-service-${service.id}`} treatmentRooms={treatmentRooms} defaultValues={service} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function DeactivateServiceDialog({
  workspaceId,
  unitId,
  service,
  open,
  onOpenChange,
}: Omit<Props, "treatmentRooms"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateServiceAction(workspaceId, unitId, service.id)
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
          <AlertDialogTitle>Desativar serviço?</AlertDialogTitle>
          <AlertDialogDescription>
            O serviço <strong>{service.name}</strong> deixa de ser oferecido nesta unidade e sai dos formulários de
            agendamento e de atendimento. Nada é apagado: os agendamentos e atendimentos antigos continuam com ele, e
            você pode reativá-lo quando quiser. Só é possível desativar sem agendamentos por vir com este serviço.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDeactivate} loading={pending}>
            {pending ? "Desativando..." : "Desativar"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReactivateServiceButton({ workspaceId, unitId, service }: Omit<Props, "treatmentRooms">) {
  const [pending, startTransition] = useTransition()

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateServiceAction(workspaceId, unitId, service.id)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReactivate} loading={pending}>
      <ArchiveRestoreIcon />
      {pending ? "Reativando..." : "Reativar"}
    </Button>
  )
}
