"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { createAppointmentAction } from "@/lib/actions/appointment"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { AppointmentForm, type AppointmentFormOptions } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"

export function CreateAppointmentSheet({
  workspaceId,
  unitId,
  memberId,
  defaultStartsAt,
  ...options
}: AppointmentFormOptions & { workspaceId: string; unitId?: string; memberId?: string; defaultStartsAt: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)
  const units = options.units ?? []

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setKey((current) => current + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Novo agendamento
      </SheetTrigger>
      <SheetContent>
        <AppointmentForm
          key={key}
          workspaceId={workspaceId}
          {...options}
          units={unitId ? undefined : options.units}
          mode="create"
          defaultValues={{
            unitId: unitId ?? (units.length === 1 ? units[0].id : null),
            workspaceMemberId: memberId || null,
            customer: null,
            startsAt: defaultStartsAt,
            durationMinutes: 60,
            serviceId: null,
            stationId: null,
            color: null,
          }}
          action={(prev, formData) => createAppointmentAction(workspaceId, prev, formData)}
          onDone={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}
