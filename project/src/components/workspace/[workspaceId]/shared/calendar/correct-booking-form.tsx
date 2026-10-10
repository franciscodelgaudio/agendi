"use client"

import { useState } from "react"
import Link from "@/components/shared/link"
import { Undo2Icon } from "lucide-react"
import { correctBookingAction } from "@/lib/actions/booking"
import type { BookingRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list"

import { Button } from "@/components/ui/button"
import { BookingForm, type BookingFormOptions } from "@/components/workspace/[workspaceId]/shared/calendar/booking-form"
import { UndoRegisterDialog } from "@/components/workspace/[workspaceId]/shared/calendar/register-booking-dialog"

// Agendamento que já virou atendimento: horário, duração, hóspede, quarto, espaço e cor ainda
// se corrigem aqui (e vão para o atendimento). O resto se altera em Atendimentos, filtrado pelo
// dia na unidade do agendamento. Registro feito por engano se desfaz.
export function CorrectBookingForm({
  workspaceId,
  booking,
  onDone,
  onUndone,
  ...options
}: BookingFormOptions & {
  workspaceId: string
  booking: BookingRow
  onDone: () => void
  onUndone: () => void
}) {
  const [undoOpen, setUndoOpen] = useState(false)
  const date = booking.startsAt.slice(0, 10)

  return (
    <>
      <BookingForm
        {...options}
        mode="correct"
        defaultValues={{
          unitId: booking.unitId,
          therapistId: booking.therapistId,
          guestName: booking.guest.name,
          room: booking.guest.room,
          startsAt: booking.startsAt,
          durationMinutes: booking.durationMinutes,
          serviceId: booking.service.serviceId,
          treatmentRoomId: booking.treatmentRoom.roomId,
          productIds: booking.productIds,
          color: booking.color,
        }}
        action={(prev, formData) => correctBookingAction(workspaceId, booking.id, prev, formData)}
        onDone={onDone}
        footer={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/workspace/${workspaceId}/unit/${booking.unitId}/appointments?${new URLSearchParams({ from: date, to: date })}`}
                />
              }
            >
              Ver em Atendimentos
            </Button>
            <Button type="button" variant="ghost" onClick={() => setUndoOpen(true)}>
              <Undo2Icon />
              Desfazer registro
            </Button>
          </>
        }
      />
      <UndoRegisterDialog
        workspaceId={workspaceId}
        booking={booking}
        open={undoOpen}
        onOpenChange={setUndoOpen}
        onUndone={onUndone}
      />
    </>
  )
}
