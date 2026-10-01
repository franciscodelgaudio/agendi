"use client"

import { useState, useTransition } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { registerBookingAction } from "@/lib/actions/appointment"
import type { BookingRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list"

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
import { formatDuration } from "@/components/shared/service-format"

// A data do agendamento é um horário de Brasília "de parede", então é formatada em UTC.
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// Registro com um clique: confirma os dados do agendamento e salva o atendimento com eles.
// onAdjust abre o formulário de atendimento pré-preenchido, para quando algo mudou.
export function RegisterBookingDialog({
  workspaceId,
  booking,
  open,
  onOpenChange,
  onRegistered,
  onAdjust,
}: {
  workspaceId: string
  booking: BookingRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered: () => void
  onAdjust: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRegister() {
    startTransition(async () => {
      const result = await registerBookingAction(workspaceId, booking.id)
      setError(result.error)
      if (!result.error) {
        onOpenChange(false)
        onRegistered()
      }
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
          <AlertDialogTitle>Registrar atendimento?</AlertDialogTitle>
          <AlertDialogDescription>
            O atendimento será salvo com os dados do agendamento. Se algo mudou, ajuste antes ou edite depois em
            Atendimentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Hóspede</dt>
          <dd>
            {booking.guest.name} · Quarto {booking.guest.room}
          </dd>
          <dt className="text-muted-foreground">Serviço</dt>
          <dd>{booking.service.serviceName}</dd>
          <dt className="text-muted-foreground">Profissional</dt>
          <dd>{booking.therapistName}</dd>
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="first-letter:uppercase">
            {dateFormat.format(new Date(`${booking.startsAt}:00Z`))} · {formatDuration(booking.durationMinutes)}
          </dd>
        </dl>
        <FutureWarning startsAt={booking.startsAt} />
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
              onAdjust()
            }}
          >
            Ajustar antes de registrar
          </Button>
          <Button onClick={handleRegister} loading={pending}>
            {pending ? "Registrando..." : "Registrar"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// O conteúdo do diálogo só monta quando ele abre, então "agora" é o momento da abertura.
function FutureWarning({ startsAt }: { startsAt: string }) {
  const [now] = useState(() => Date.now())
  // startsAt é "2026-09-24T14:30" no horário de Brasília (UTC-3).
  if (new Date(`${startsAt}:00-03:00`).getTime() <= now) return null
  return (
    <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      Este agendamento ainda não aconteceu. Confira se o atendimento já foi realizado.
    </p>
  )
}
