"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createUnitAction, type CreateUnitState } from "@/lib/actions/unit"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field"
import { UnitFields, type UnitTeamOptions } from "@/components/unit-fields"
import { OpeningBalanceFields } from "@/components/opening-balance-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateUnitSheet({ workspaceId, team }: { workspaceId: string; team: UnitTeamOptions }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: CreateUnitState, formData: FormData) => {
      const next = await createUnitAction(workspaceId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger data-tour="create-unit" render={<Button />}>
        <PlusIcon />
        Cadastrar unidade
      </SheetTrigger>
      <SheetContent data-tour="create-unit-form">
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Cadastrar unidade</SheetTitle>
            <SheetDescription>Adicione uma unidade a este workspace.</SheetDescription>
          </SheetHeader>
          {/* Só os campos rolam; título e botões ficam fixos. */}
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <UnitFields idPrefix="create-unit" workspaceId={workspaceId} team={team} />
            <Field>
              <OpeningBalanceFields idPrefix="create-unit" />
              <FieldDescription>
                Cria uma carteira só desta unidade. Para dividir uma conta com outras unidades, use Carteiras no Caixa.
              </FieldDescription>
            </Field>
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
