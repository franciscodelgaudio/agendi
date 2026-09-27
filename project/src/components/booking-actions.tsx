"use client"

import { useState, useTransition } from "react"
import Link from "@/components/link"
import { useRouter } from "next/navigation"
import { ClipboardCheckIcon, CircleCheckIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { convertBookingAction } from "@/lib/actions/appointment"
import { deleteBookingAction, updateBookingAction } from "@/lib/actions/booking"
import type { BookingRow } from "@/lib/booking-list"

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
import { AppointmentForm } from "@/components/appointment-form"
import { BookingForm, type BookingFormOptions } from "@/components/booking-form"

// Com units (visão do workspace), a edição permite trocar a unidade.
type Props = BookingFormOptions & { workspaceId: string; booking: BookingRow }

// As ações não recarregam a página (o calendário refaz a busca sozinho), então a lista pede o refresh.
export function BookingActions({ workspaceId, booking, ...options }: Props) {
  const router = useRouter()
  const [sheet, setSheet] = useState<"edit" | "convert" | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  function openSheet(next: "edit" | "convert") {
    setFormKey((k) => k + 1)
    setSheet(next)
  }

  function done() {
    setSheet(null)
    router.refresh()
  }

  // Já atendido: não é mais editável; o atalho leva a Atendimentos filtrado pelo dia.
  const day = booking.startsAt.slice(0, 10)
  const appointmentsHref = `/workspace/${workspaceId}/unit/${booking.unitId}/appointments?${new URLSearchParams({ from: day, to: day })}`

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Ações do agendamento de ${booking.guest.name}`} />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {booking.appointmentId ? (
            <DropdownMenuItem render={<Link href={appointmentsHref} />}>
              <CircleCheckIcon />
              Ver em Atendimentos
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => openSheet("edit")}>
                <PencilIcon />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSheet("convert")}>
                <ClipboardCheckIcon />
                Registrar atendimento
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={sheet !== null} onOpenChange={(next) => !next && setSheet(null)}>
        <SheetContent>
          {sheet === "edit" && (
            <BookingForm
              key={formKey}
              {...options}
              mode="edit"
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
              action={(prev, formData) => updateBookingAction(workspaceId, booking.id, prev, formData)}
              onDone={done}
              onConvert={() => openSheet("convert")}
              onDelete={() => setDeleteOpen(true)}
            />
          )}
          {sheet === "convert" && (
            <AppointmentForm
              key={formKey}
              {...options}
              mode="create"
              defaultValues={{
                unitId: booking.unitId,
                guestName: booking.guest.name,
                room: booking.guest.room,
                performedAt: booking.startsAt,
                items: [{ serviceId: booking.service.serviceId, therapistId: booking.therapistId }],
                productIds: booking.productIds,
              }}
              action={(prev, formData) => convertBookingAction(workspaceId, booking.id, prev, formData)}
              onDone={done}
            />
          )}
        </SheetContent>
      </Sheet>

      <DeleteBookingDialog
        workspaceId={workspaceId}
        booking={booking}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={done}
      />
    </>
  )
}

function DeleteBookingDialog({
  workspaceId,
  booking,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  booking: BookingRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBookingAction(workspaceId, booking.id)
      setError(result.error)
      if (!result.error) {
        onOpenChange(false)
        onDeleted()
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
          <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
          <AlertDialogDescription>
            O agendamento de <strong>{booking.guest.name}</strong> (quarto {booking.guest.room}) será excluído
            permanentemente. Essa ação não pode ser desfeita.
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
