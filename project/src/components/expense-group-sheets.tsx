"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createExpenseGroupAction,
  deleteExpenseGroupAction,
  updateExpenseGroupAction,
  type ExpenseActionState,
} from "@/lib/actions/expense"
import type { ExpenseGroupIcon } from "@/lib/expense-group-icon"

import { AmountInput } from "@/components/amount-input"
import { ExpenseGroupIconPicker } from "@/components/expense-group-icon"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type Group = { id: string; name: string; monthlyLimitCents: number | null; icon: ExpenseGroupIcon | null }

type Props = { workspaceId: string; unitId: string; icons: ExpenseGroupIcon[] }

function ExpenseGroupForm({
  title,
  description,
  submitLabel,
  group,
  icons,
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  group?: Group
  icons: ExpenseGroupIcon[]
  action: (prev: ExpenseActionState, formData: FormData) => Promise<ExpenseActionState>
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ExpenseActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = group ? `edit-expense-group-${group.id}` : "create-expense-group"

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            placeholder="Impostos"
            defaultValue={group?.name}
            maxLength={40}
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-limit`}>Limite por mês (opcional)</FieldLabel>
          <AmountInput
            id={`${idPrefix}-limit`}
            name="monthlyLimit"
            max={100_000_000}
            placeholder="R$ 0,00"
            defaultValue={group?.monthlyLimitCents}
          />
        </Field>
        <Field>
          <FieldLabel id={`${idPrefix}-icon`}>Ícone</FieldLabel>
          <ExpenseGroupIconPicker
            icons={icons}
            name="iconId"
            defaultValue={group?.icon?.id}
            labelledBy={`${idPrefix}-icon`}
          />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? submitLabel[1] : submitLabel[0]}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function CreateExpenseGroupSheet({ workspaceId, unitId, icons }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Cadastrar grupo
      </SheetTrigger>
      <SheetContent>
        <ExpenseGroupForm
          title="Cadastrar grupo"
          description="Grupo para organizar as despesas da unidade."
          submitLabel={["Cadastrar", "Cadastrando..."]}
          icons={icons}
          action={(prev, formData) => createExpenseGroupAction(workspaceId, unitId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

export function ExpenseGroupActions({ workspaceId, unitId, icons, group }: Props & { group: Group }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExpenseGroupAction(workspaceId, unitId, group.id)
      setError(result.error)
      if (!result.error) setDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${group.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((key) => key + 1)
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

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <ExpenseGroupForm
            key={editKey}
            title="Editar grupo"
            description="Altere o nome, o limite e o ícone deste grupo."
            submitLabel={["Salvar", "Salvando..."]}
            group={group}
            icons={icons}
            action={(prev, formData) => updateExpenseGroupAction(workspaceId, unitId, group.id, prev, formData)}
            onDone={() => setEditOpen(false)}
          />
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
            <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo <strong>{group.name}</strong> será excluído permanentemente.
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
    </>
  )
}
