"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { createBookingAction } from "@/lib/actions/booking"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { BookingForm, type BookingFormOptions } from "@/components/booking-form"

type Props = BookingFormOptions & {
  workspaceId: string
  // Na unidade, o agendamento é dela; na visão do workspace (com units), é escolhida no formulário.
  unitId?: string
  // Filtro de profissional ativo na lista, que já vem escolhido.
  therapistId?: string
  // Início sugerido ("2026-09-24T14:30"), no horário de Brasília.
  defaultStartsAt: string
}

export function CreateBookingSheet({ workspaceId, unitId, therapistId, defaultStartsAt, ...options }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário vazio e sem erro antigo.
  const [formKey, setFormKey] = useState(0)
  const units = options.units

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Novo agendamento
      </SheetTrigger>
      <SheetContent>
        <BookingForm
          key={formKey}
          {...options}
          mode="create"
          defaultValues={{
            unitId: unitId ?? (units?.length === 1 ? units[0].id : null),
            therapistId: therapistId || null,
            guestName: "",
            room: "",
            startsAt: defaultStartsAt,
            durationMinutes: 60,
            serviceId: null,
            treatmentRoomId: null,
            productIds: [],
            color: null,
          }}
          action={(prev, formData) => createBookingAction(workspaceId, prev, formData)}
          onDone={() => {
            setOpen(false)
            // A ação não recarrega a página (o calendário refaz a busca sozinho).
            router.refresh()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}
