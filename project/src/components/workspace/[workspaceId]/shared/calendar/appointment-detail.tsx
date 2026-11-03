"use client"

import { useState } from "react"
import { CircleCheckIcon, CircleXIcon, EllipsisIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { updateAppointmentAction } from "@/lib/actions/appointment"
import type { AppointmentRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { currencyFormat, formatDuration } from "@/components/shared/service-format"
import { AppointmentForm, type AppointmentFormOptions } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"
import {
  appointmentFormValues,
  canReopen,
  DeleteAppointmentDialog,
  STATUS_LABELS,
  STATUS_VARIANTS,
  useAppointmentStatus,
  type AppointmentPermissions,
} from "@/components/workspace/[workspaceId]/shared/calendar/appointment-actions"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

type DetailProps = {
  workspaceId: string
  appointment: AppointmentRow
  permissions: AppointmentPermissions
  options: AppointmentFormOptions
  onClose: () => void
}

function AppointmentDetail({ workspaceId, appointment, permissions, options, onClose }: DetailProps) {
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { pending, change, confirmation } = useAppointmentStatus(workspaceId, onClose)
  const { canSchedule, canAttend } = permissions
  const scheduled = appointment.status === "scheduled"
  const reopens = canReopen(appointment, permissions)
  const cancels = scheduled && canSchedule
  const priceCents = options.services.find((service) => service.id === appointment.serviceId)?.priceCents
  const day = dayFormat.format(new Date(`${appointment.startsAt.slice(0, 10)}T00:00:00Z`))
  const guest = appointment.customer?.kind === "guest" ? appointment.customer : null

  if (editing) {
    return (
      <AppointmentForm
        workspaceId={workspaceId}
        {...options}
        mode="edit"
        defaultValues={appointmentFormValues(appointment)}
        action={(prev, formData) => updateAppointmentAction(workspaceId, appointment.id, prev, formData)}
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
    ["Cliente", appointment.customerName ? `${appointment.customerName}${guest ? " (sem cadastro)" : ""}` : "Sem cliente"],
    ...(guest?.observation ? [["Observação", guest.observation] as [string, string]] : []),
    ["Profissional", appointment.memberName ?? "—"],
    ["Estação", appointment.stationName ?? "—"],
    ["Duração", formatDuration(appointment.durationMinutes)],
    ...(priceCents !== undefined ? [["Valor", currencyFormat.format(priceCents / 100)] as [string, string]] : []),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {confirmation}
      <div className="flex items-center gap-2 p-4 pr-14">
        <Badge variant={STATUS_VARIANTS[appointment.status]}>{STATUS_LABELS[appointment.status]}</Badge>
        <div className="ml-auto flex items-center gap-1">
          {cancels && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon />
              Editar
            </Button>
          )}
          {(cancels || reopens || canSchedule) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Mais ações" disabled={pending} />}>
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-44">
                {cancels && (
                  <DropdownMenuItem onClick={() => change(appointment, "cancelled")}>
                    <CircleXIcon />
                    Cancelar agendamento
                  </DropdownMenuItem>
                )}
                {reopens && (
                  <DropdownMenuItem onClick={() => change(appointment, "scheduled")}>
                    <Undo2Icon />
                    Reabrir
                  </DropdownMenuItem>
                )}
                {canSchedule && (
                  <>
                    {(cancels || reopens) && <DropdownMenuSeparator />}
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2Icon />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        <div className="grid gap-1">
          <SheetTitle className="text-xl font-semibold tracking-tight">{appointment.name}</SheetTitle>
          <SheetDescription className="text-sm tabular-nums first-letter:uppercase">
            {day} · {appointment.startsAt.slice(11)}–{appointment.endsAt.slice(11)}
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
        {appointment.status === "done" && (
          <p className="flex items-center gap-2 bg-accent px-3 py-2.5 text-sm text-accent-foreground">
            <CircleCheckIcon className="size-4 shrink-0" />
            Atendimento concluído.
          </p>
        )}
        {appointment.status === "cancelled" && (
          <p className="bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            Agendamento cancelado. O horário da profissional e a estação ficaram livres.
          </p>
        )}
      </div>

      {scheduled && canAttend && (
        <div className="border-t p-4">
          <Button size="lg" className="h-12 w-full text-base" loading={pending} onClick={() => change(appointment, "done")}>
            <CircleCheckIcon />
            Concluir atendimento
          </Button>
        </div>
      )}

      <DeleteAppointmentDialog
        workspaceId={workspaceId}
        appointment={appointment}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDone={onClose}
      />
    </div>
  )
}

type SheetProps = Omit<DetailProps, "appointment" | "onClose"> & {
  appointment: AppointmentRow | null
  contentKey: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AppointmentDetailSheet({ appointment, contentKey, open, onOpenChange, ...props }: SheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {appointment && (
          <AppointmentDetail key={contentKey} {...props} appointment={appointment} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
}
