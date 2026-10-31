"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { createServiceAction, deleteServiceAction, updateServiceAction, type ServiceActionState } from "@/lib/actions/service"
import { AmountInput } from "@/components/shared/amount-input"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export type ServiceRow = { id: string; name: string; durationMinutes: number; priceCents: number }

function ServiceFields({ idPrefix, service }: { idPrefix: string; service?: ServiceRow }) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Massagem relaxante"
          defaultValue={service?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-duration`}>Duração (minutos)</FieldLabel>
          <Input
            id={`${idPrefix}-duration`}
            name="duration"
            type="number"
            inputMode="numeric"
            min={5}
            max={720}
            step={5}
            defaultValue={service?.durationMinutes ?? 60}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-price`}>Preço</FieldLabel>
          <AmountInput
            id={`${idPrefix}-price`}
            name="price"
            max={100_000_000}
            placeholder="R$ 0,00"
            defaultValue={service?.priceCents ?? 0}
            required
          />
        </Field>
      </div>
    </>
  )
}

export function CreateServiceSheet({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: ServiceActionState, formData: FormData) => {
      const next = await createServiceAction(workspaceId, prev, formData)
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
            <SheetDescription>O serviço vale para todas as unidades do workspace.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <ServiceFields idPrefix="create-service" />
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

export function ServiceActions({ workspaceId, service }: { workspaceId: string; service: ServiceRow }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [state, formAction, pending] = useActionState(
    async (prev: ServiceActionState, formData: FormData) => {
      const next = await updateServiceAction(workspaceId, service.id, prev, formData)
      if (!next.error) setEditOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${service.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
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

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>Editar serviço</SheetTitle>
              <SheetDescription>A mudança vale para os próximos agendamentos.</SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              <ServiceFields idPrefix={`edit-service-${service.id}`} service={service} />
            </FieldGroup>
            <SheetFooter>
              <Button type="submit" loading={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setDeleteOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{service.name}</strong> sai da lista de serviços. Os agendamentos já concluídos continuam com o nome
              dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteServiceAction(workspaceId, service.id)
                  setError(result.error)
                  if (!result.error) setDeleteOpen(false)
                })
              }
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
