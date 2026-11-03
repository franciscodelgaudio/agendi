"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  deleteAppointmentAction,
  setAppointmentStatusAction,
  type ReceivableToConfirm,
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
import { FieldError } from "@/components/ui/field"
import { ConfirmPaymentSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import type { AppointmentFormValues } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"

export const STATUS_LABELS = { scheduled: "Agendado", done: "Concluído", cancelled: "Cancelado" } as const

export const STATUS_VARIANTS = { scheduled: "outline", done: "default", cancelled: "secondary" } as const

export type AppointmentPermissions = { canSchedule: boolean; canAttend: boolean }

export function appointmentFormValues(appointment: AppointmentRow): AppointmentFormValues {
  return {
    unitId: appointment.unitId,
    workspaceMemberId: appointment.workspaceMemberId,
    customer:
      appointment.customer?.kind === "registered"
        ? { ...appointment.customer, name: appointment.customerName ?? "" }
        : appointment.customer,
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
  const [toConfirm, setToConfirm] = useState<ReceivableToConfirm | null>(null)
  function change(appointment: AppointmentRow, status: AppointmentRow["status"]) {
    startTransition(async () => {
      const result = await setAppointmentStatusAction(workspaceId, appointment.id, status)
      if (result.error) toast.error(result.error)
      else if (result.receivableToConfirm) setToConfirm(result.receivableToConfirm)
      else onDone()
    })
  }
  const confirmation = (
    <ConfirmPaymentSheet
      workspaceId={workspaceId}
      receivable={toConfirm}
      onClose={() => {
        setToConfirm(null)
        onDone()
      }}
    />
  )
  return { pending, change, confirmation }
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
            O agendamento de <strong>{appointment.customerName ?? appointment.name}</strong> será excluído permanentemente,
            junto com o recebível pendente dele, se houver. Essa ação não pode ser desfeita.
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
