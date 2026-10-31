"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from "@/lib/actions/customer"
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
import { Textarea } from "@/components/ui/textarea"

export type CustomerRow = { id: string; name: string; observation: string | null; cellphone: string | null }

export function CustomerFields({ idPrefix, customer }: { idPrefix: string; customer?: CustomerRow }) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Maria Silva"
          defaultValue={customer?.name}
          maxLength={120}
          autoFocus
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-cellphone`}>Celular (opcional)</FieldLabel>
        <Input
          id={`${idPrefix}-cellphone`}
          name="cellphone"
          type="tel"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          defaultValue={customer?.cellphone ?? ""}
          maxLength={20}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-observation`}>Observação (opcional)</FieldLabel>
        <Textarea
          id={`${idPrefix}-observation`}
          name="observation"
          placeholder="Preferências, alergias..."
          defaultValue={customer?.observation ?? ""}
          maxLength={1000}
        />
      </Field>
    </>
  )
}

export function CreateCustomerSheet({
  workspaceId,
  onCreated,
  trigger,
}: {
  workspaceId: string
  onCreated?: (customer: { id: string; name: string }) => void
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: CustomerFormState, formData: FormData) => {
      const next = await createCustomerAction(workspaceId, prev, formData)
      if (!next.error) {
        setOpen(false)
        if (next.customerId) onCreated?.({ id: next.customerId, name: String(formData.get("name") ?? "").trim() })
      }
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger ?? <Button />}>
        {!trigger && (
          <>
            <PlusIcon />
            Cadastrar cliente
          </>
        )}
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Cadastrar cliente</SheetTitle>
            <SheetDescription>O cliente fica disponível para agendar em qualquer unidade.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <CustomerFields idPrefix="create-customer" />
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

export function CustomerActions({ workspaceId, customer }: { workspaceId: string; customer: CustomerRow }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [state, formAction, pending] = useActionState(
    async (prev: CustomerFormState, formData: FormData) => {
      const next = await updateCustomerAction(workspaceId, customer.id, prev, formData)
      if (!next.error) setEditOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${customer.name}`} />}>
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
              <SheetTitle>Editar cliente</SheetTitle>
              <SheetDescription>Altere os dados deste cliente.</SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              <CustomerFields idPrefix={`edit-customer-${customer.id}`} customer={customer} />
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
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{customer.name}</strong> será excluído permanentemente. Essa ação não pode ser desfeita.
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
                  const result = await deleteCustomerAction(workspaceId, customer.id)
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
