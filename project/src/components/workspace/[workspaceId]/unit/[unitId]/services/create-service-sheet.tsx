"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createServiceAction, type ServiceActionState } from "@/lib/actions/service"

import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { ServiceFields, type ServiceRoomOption } from "@/components/workspace/[workspaceId]/unit/[unitId]/services/service-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type Props = { workspaceId: string; unitId: string; treatmentRooms: ServiceRoomOption[] }

export function CreateServiceSheet({ workspaceId, unitId, treatmentRooms }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: ServiceActionState, formData: FormData) => {
      const next = await createServiceAction(workspaceId, unitId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger data-tour="create-service" render={<Button />}>
        <PlusIcon />
        Cadastrar serviço
      </SheetTrigger>
      <SheetContent data-tour="create-service-form">
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Cadastrar serviço</SheetTitle>
            <SheetDescription>Adicione um serviço prestado nesta unidade.</SheetDescription>
          </SheetHeader>
          {/* Só os campos rolam; título e botões ficam fixos. */}
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <ServiceFields idPrefix="create-service" treatmentRooms={treatmentRooms} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
