"use client"

import { useState, useTransition } from "react"
import { BanIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { deleteAppointmentBlockedAction, updateAppointmentBlockedAction } from "@/lib/actions/appointment-blocked"
import type { AppointmentBlockedRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { formatDuration } from "@/components/shared/service-format"
import { AppointmentBlockedForm } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-blocked-form"
import type { TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

type DetailProps = {
  workspaceId: string
  blocked: AppointmentBlockedRow
  units: { id: string; name: string }[]
  therapists: TherapistOption[]
  canManage: boolean
  onClose: () => void
}

function AppointmentBlockedDetail({ workspaceId, blocked, units, therapists, canManage, onClose }: DetailProps) {
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const day = dayFormat.format(new Date(`${blocked.startsAt.slice(0, 10)}T00:00:00Z`))
  const unitName = blocked.unitId ? (units.find((unit) => unit.id === blocked.unitId)?.name ?? "—") : "Todas as unidades"

  if (editing) {
    return (
      <AppointmentBlockedForm
        mode="edit"
        unitId={blocked.unitId}
        therapists={therapists}
        defaultValues={blocked}
        action={(prev, formData) => updateAppointmentBlockedAction(workspaceId, blocked.id, prev, formData)}
        onDone={onClose}
        footer={
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Descartar
          </Button>
        }
      />
    )
  }

  const details: [string, string][] = [
    ["Profissional", blocked.memberName ?? "—"],
    ["Unidade", unitName],
    ["Duração", formatDuration(blocked.durationMinutes)],
    ["Motivo", blocked.reason ?? "—"],
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-4 pr-14">
        <Badge variant="secondary">
          <BanIcon />
          Bloqueado
        </Badge>
        {canManage && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon />
              Editar
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Excluir bloqueio" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        <div className="grid gap-1">
          <SheetTitle className="text-xl font-semibold tracking-tight">{blocked.reason ?? "Agenda bloqueada"}</SheetTitle>
          <SheetDescription className="text-sm tabular-nums first-letter:uppercase">
            {day} · {blocked.startsAt.slice(11)}–{blocked.endsAt.slice(11)}
          </SheetDescription>
        </div>
        <dl className="grid border-t text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b py-3">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setDeleteOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloqueio?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário de <strong>{blocked.memberName ?? "a profissional"}</strong> volta a ficar livre para agendamentos.
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
                  const result = await deleteAppointmentBlockedAction(workspaceId, blocked.id)
                  setError(result.error)
                  if (!result.error) {
                    setDeleteOpen(false)
                    onClose()
                  }
                })
              }
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type SheetProps = Omit<DetailProps, "blocked" | "onClose"> & {
  blocked: AppointmentBlockedRow | null
  contentKey: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AppointmentBlockedDetailSheet({ blocked, contentKey, open, onOpenChange, ...props }: SheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {blocked && <AppointmentBlockedDetail key={contentKey} {...props} blocked={blocked} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  )
}
