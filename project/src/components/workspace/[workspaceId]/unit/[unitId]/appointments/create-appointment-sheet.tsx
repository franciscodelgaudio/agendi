"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { createAppointmentAction, createWorkspaceAppointmentAction } from "@/lib/actions/appointment"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { AppointmentForm, type AppointmentOptions } from "@/components/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-form"

type Props = AppointmentOptions & {
  workspaceId: string
  // Na unidade, o atendimento é dela; na visão do workspace (com units), é escolhida no formulário.
  unitId?: string
  // Data/hora inicial ("2026-09-24T14:30"), no horário de Brasília.
  defaultPerformedAt: string
}

export function CreateAppointmentSheet({ workspaceId, unitId, defaultPerformedAt, ...options }: Props) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário vazio e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

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
        Registrar atendimento
      </SheetTrigger>
      <SheetContent>
        <AppointmentForm
          key={formKey}
          {...options}
          mode="create"
          defaultValues={{ guestName: "", room: "", performedAt: defaultPerformedAt }}
          action={(prev, formData) =>
            unitId
              ? createAppointmentAction(workspaceId, unitId, prev, formData)
              : createWorkspaceAppointmentAction(workspaceId, prev, formData)
          }
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
