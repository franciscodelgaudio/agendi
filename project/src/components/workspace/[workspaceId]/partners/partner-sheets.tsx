"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { createPartnerAction, updatePartnerAction, type PartnerFormState } from "@/lib/actions/partner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DeletePartnerDialog, PartnerFields } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-partner-sheet"
import type { UnitPartner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"

const NO_UNIT = "none"

export type PartnerRow = UnitPartner & { unit: { id: string; name: string } | null }

type UnitOption = { id: string; name: string }

function PartnerSheet({
  workspaceId,
  partner,
  units,
  open,
  onOpenChange,
}: {
  workspaceId: string
  partner: PartnerRow | null
  units: UnitOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [unitId, setUnitId] = useState(partner?.unit?.id ?? NO_UNIT)
  const options = partner?.unit ? [partner.unit, ...units.filter((unit) => unit.id !== partner.unit!.id)] : units
  const items = [{ value: NO_UNIT, label: "Sem unidade" }, ...options.map((unit) => ({ value: unit.id, label: unit.name }))]
  const [state, formAction, pending] = useActionState(
    async (prev: PartnerFormState, formData: FormData) => {
      const linked = unitId === NO_UNIT ? null : unitId
      const next = partner
        ? await updatePartnerAction(workspaceId, partner.id, linked, prev, formData)
        : await createPartnerAction(workspaceId, linked ?? "", prev, formData)
      if (!next.error) onOpenChange(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{partner ? "Editar parceiro" : "Novo parceiro"}</SheetTitle>
            <SheetDescription>
              Para unidades que funcionam dentro de outro estabelecimento, que recebe dos clientes e repassa por período, ficando
              com uma parte.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <Field>
              <FieldLabel htmlFor="partner-unit">Unidade</FieldLabel>
              <Select items={items} value={unitId} onValueChange={(next) => setUnitId(next as string)}>
                <SelectTrigger id="partner-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Cada unidade tem no máximo um parceiro. Sem unidade, o parceiro guarda o histórico de repasses.</FieldDescription>
            </Field>
            <PartnerFields partner={partner} workspaceId={workspaceId} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function CreatePartnerButton({ workspaceId, units }: { workspaceId: string; units: UnitOption[] }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)

  return (
    <>
      <Button
        onClick={() => {
          setKey((current) => current + 1)
          setOpen(true)
        }}
      >
        <PlusIcon />
        Novo parceiro
      </Button>
      <PartnerSheet key={key} workspaceId={workspaceId} partner={null} units={units} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function PartnerActions({
  workspaceId,
  partner,
  units,
  deletedHref,
}: {
  workspaceId: string
  partner: PartnerRow
  units: UnitOption[]
  deletedHref?: string
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${partner.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((current) => current + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PartnerSheet key={editKey} workspaceId={workspaceId} partner={partner} units={units} open={editOpen} onOpenChange={setEditOpen} />
      <DeletePartnerDialog
        workspaceId={workspaceId}
        partner={partner}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          setDeleteOpen(false)
          if (deletedHref) router.replace(deletedHref)
        }}
      />
    </>
  )
}
