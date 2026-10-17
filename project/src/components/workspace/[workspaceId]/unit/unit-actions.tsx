"use client"

import { useActionState, useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, PencilIcon } from "lucide-react"
import { deactivateUnitAction, reactivateUnitAction, updateUnitAction, type UpdateUnitState } from "@/lib/actions/unit"
import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"
import type { TreatmentRoomOption } from "@/components/workspace/[workspaceId]/unit/treatment-room-fields"

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
import { UnitFields, type UnitTeamOptions } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Unit = {
  id: string
  name: string
  avatarUrl: string | null
  revenueShare: RevenueShare | null
  treatmentRooms: TreatmentRoomOption[]
  businessHours: BusinessHours
  active: boolean
}

export function UnitActions({ workspaceId, unit, team }: { workspaceId: string; unit: Unit; team: UnitTeamOptions }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  // Desativada não aceita alteração: só reativar.
  if (!unit.active) return <ReactivateUnitButton workspaceId={workspaceId} unit={unit} />

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${unit.name}`} />}
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
          <EditUnitForm
            key={editKey}
            workspaceId={workspaceId}
            unit={unit}
            team={team}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <DeactivateUnitDialog
        workspaceId={workspaceId}
        unit={unit}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </>
  )
}

function EditUnitForm({
  workspaceId,
  unit,
  team,
  onDone,
}: {
  workspaceId: string
  unit: Unit
  team: UnitTeamOptions
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: UpdateUnitState, formData: FormData) => {
      const next = await updateUnitAction(workspaceId, unit.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar unidade</SheetTitle>
        <SheetDescription>Altere os dados desta unidade.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <UnitFields idPrefix={`edit-unit-${unit.id}`} workspaceId={workspaceId} defaultValues={unit} team={team} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function DeactivateUnitDialog({
  workspaceId,
  unit,
  open,
  onOpenChange,
}: {
  workspaceId: string
  unit: Unit
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateUnitAction(workspaceId, unit.id)
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
          <AlertDialogTitle>Desativar unidade?</AlertDialogTitle>
          <AlertDialogDescription>
            A unidade <strong>{unit.name}</strong> sai da agenda e das demais telas do dia a dia. Nada é
            apagado: atendimentos, despesas e folha continuam no caixa e nas carteiras, e você pode
            reativá-la quando quiser.
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

function ReactivateUnitButton({ workspaceId, unit }: { workspaceId: string; unit: Unit }) {
  const [pending, startTransition] = useTransition()

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateUnitAction(workspaceId, unit.id)
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
