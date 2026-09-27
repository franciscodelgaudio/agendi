"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { deleteUnitAction, updateUnitAction, type UpdateUnitState } from "@/lib/actions/unit"
import type { RevenueShare } from "@/lib/revenue-share"
import type { TreatmentRoomOption } from "@/components/treatment-room-fields"

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
import { UnitFields, type UnitTeamOptions } from "@/components/unit-fields"
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
}

export function UnitActions({ workspaceId, unit, team }: { workspaceId: string; unit: Unit; team: UnitTeamOptions }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

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
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Excluir
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

      <DeleteUnitDialog
        workspaceId={workspaceId}
        unit={unit}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
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

function DeleteUnitDialog({
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

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUnitAction(workspaceId, unit.id)
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
          <AlertDialogTitle>Excluir unidade?</AlertDialogTitle>
          <AlertDialogDescription>
            A unidade <strong>{unit.name}</strong> será excluída permanentemente. Essa ação não pode ser desfeita.
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
