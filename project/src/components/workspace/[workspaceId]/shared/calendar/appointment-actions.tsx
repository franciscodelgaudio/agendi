"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleCheckIcon, CircleXIcon, EllipsisIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import {
  deleteAppointmentAction,
  setAppointmentStatusAction,
  updateAppointmentAction,
} from "@/lib/actions/appointment"
import type { AppointmentRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
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
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  AppointmentForm,
  type AppointmentFormOptions,
  type AppointmentFormValues,
} from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"

export const STATUS_LABELS = { scheduled: "Agendado", done: "Concluído", cancelled: "Cancelado" } as const

export type AppointmentPermissions = { canSchedule: boolean; canAttend: boolean }

export function appointmentFormValues(appointment: AppointmentRow): AppointmentFormValues {
  return {
    unitId: appointment.unitId,
    workspaceMemberId: appointment.workspaceMemberId,
    customer: appointment.customerName ? { id: appointment.customerId, name: appointment.customerName } : null,
    startsAt: appointment.startsAt,
    durationMinutes: appointment.durationMinutes,
    serviceId: appointment.serviceId,
    stationId: appointment.stationId,
    color: appointment.color,
  }
}

export function canReopen(appointment: AppointmentRow, { canSchedule, canAttend }: AppointmentPermissions) {
  return appointment.status === "done" ? canAttend : appointment.status === "cancelled" && canSchedule
}

export function useAppointmentStatus(workspaceId: string, onDone: () => void) {
  const [pending, startTransition] = useTransition()
  function change(appointment: AppointmentRow, status: AppointmentRow["status"]) {
    startTransition(async () => {
      const result = await setAppointmentStatusAction(workspaceId, appointment.id, status)
      if (result.error) toast.error(result.error)
      else onDone()
    })
  }
  return { pending, change }
}

export function StatusButtons({
  workspaceId,
  appointment,
  permissions,
  onDone,
}: {
  workspaceId: string
  appointment: AppointmentRow
  permissions: AppointmentPermissions
  onDone: () => void
}) {
  const { pending, change } = useAppointmentStatus(workspaceId, onDone)
  return (
    <>
      {appointment.status === "scheduled" && permissions.canAttend && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => change(appointment, "done")}>
          <CircleCheckIcon />
          Concluir
        </Button>
      )}
      {appointment.status === "scheduled" && permissions.canSchedule && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => change(appointment, "cancelled")}>
          <CircleXIcon />
          Cancelar agendamento
        </Button>
      )}
      {canReopen(appointment, permissions) && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => change(appointment, "scheduled")}>
          <Undo2Icon />
          Reabrir
        </Button>
      )}
    </>
  )
}

export function DeleteAppointmentDialog({
  workspaceId,
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  workspaceId: string
  appointment: AppointmentRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()

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
          <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
          <AlertDialogDescription>
            O agendamento de <strong>{appointment.customerName ?? "cliente excluído"}</strong> será excluído permanentemente,
            junto com a entrada dele no caixa, se houver. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteAppointmentAction(workspaceId, appointment.id)
                setError(result.error)
                if (!result.error) {
                  onOpenChange(false)
                  onDone()
                }
              })
            }
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AppointmentRowActions({
  workspaceId,
  appointment,
  permissions,
  options,
}: {
  workspaceId: string
  appointment: AppointmentRow
  permissions: AppointmentPermissions
  options: AppointmentFormOptions
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const done = () => router.refresh()
  const { pending, change } = useAppointmentStatus(workspaceId, done)
  const scheduled = appointment.status === "scheduled"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Ações do agendamento" disabled={pending} />}
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {scheduled && permissions.canSchedule && (
            <DropdownMenuItem
              onClick={() => {
                setEditKey((key) => key + 1)
                setEditOpen(true)
              }}
            >
              <PencilIcon />
              Editar
            </DropdownMenuItem>
          )}
          {scheduled && permissions.canAttend && (
            <DropdownMenuItem onClick={() => change(appointment, "done")}>
              <CircleCheckIcon />
              Concluir
            </DropdownMenuItem>
          )}
          {scheduled && permissions.canSchedule && (
            <DropdownMenuItem onClick={() => change(appointment, "cancelled")}>
              <CircleXIcon />
              Cancelar agendamento
            </DropdownMenuItem>
          )}
          {canReopen(appointment, permissions) && (
            <DropdownMenuItem onClick={() => change(appointment, "scheduled")}>
              <Undo2Icon />
              Reabrir
            </DropdownMenuItem>
          )}
          {permissions.canSchedule && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <AppointmentForm
            key={editKey}
            workspaceId={workspaceId}
            {...options}
            mode="edit"
            defaultValues={appointmentFormValues(appointment)}
            action={(prev, formData) => updateAppointmentAction(workspaceId, appointment.id, prev, formData)}
            onDone={() => {
              setEditOpen(false)
              done()
            }}
          />
        </SheetContent>
      </Sheet>

      <DeleteAppointmentDialog
        workspaceId={workspaceId}
        appointment={appointment}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDone={done}
      />
    </>
  )
}
