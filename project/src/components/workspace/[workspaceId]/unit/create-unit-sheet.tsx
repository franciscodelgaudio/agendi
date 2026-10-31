"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createUnitAction, type UnitFormState } from "@/lib/actions/unit"

import { RequiredMark } from "@/components/shared/field-hints"
import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { UnitFields, type UnitFormOptions } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateUnitSheet({ workspaceId, options }: { workspaceId: string; options: UnitFormOptions }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: UnitFormState, formData: FormData) => {
      const next = await createUnitAction(workspaceId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Cadastrar unidade
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[420px]">
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Cadastrar unidade</SheetTitle>
            <SheetDescription>
              Adicione uma unidade a este workspace. Campos com <RequiredMark /> são obrigatórios.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 gap-6 overflow-y-auto px-4 pb-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <UnitFields idPrefix="create-unit" workspaceId={workspaceId} options={options} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Cadastrando..." : "Cadastrar unidade"}
            </Button>
            <SheetClose render={<Button type="button" variant="outline" />}>Cancelar</SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
