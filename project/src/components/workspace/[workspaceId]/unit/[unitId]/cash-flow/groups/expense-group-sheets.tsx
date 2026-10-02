"use client"

import { useActionState, useState, useTransition } from "react"
import type { ExpenseOwner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createExpenseGroupAction,
  deleteExpenseGroupAction,
  updateExpenseGroupAction,
  type ExpenseActionState,
} from "@/lib/actions/expense"
import type { ExpenseGroupIcon } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon"

import { AmountInput } from "@/components/shared/amount-input"
import { ExpenseGroupIconPicker } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// limits: o limite do grupo em cada mês de LimitMonths.months, na mesma ordem.
type Group = { id: string; name: string; limits: (number | null)[]; icon: ExpenseGroupIcon | null }

// Meses ("AAAA-MM") que o limite pode passar a valer, e o já escolhido ao abrir.
export type LimitMonths = { months: string[]; defaultMonth: string }

type Props = { workspaceId: string; owner: ExpenseOwner; icons: ExpenseGroupIcon[]; limitMonths: LimitMonths }

// Os meses são do calendário, então são formatados em UTC para não deslocar.
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number)
  return monthFormat.format(new Date(Date.UTC(year, index - 1, 1)))
}

function ExpenseGroupForm({
  title,
  description,
  submitLabel,
  group,
  icons,
  limitMonths: { months, defaultMonth },
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  group?: Group
  icons: ExpenseGroupIcon[]
  limitMonths: LimitMonths
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
  const [limitFrom, setLimitFrom] = useState(defaultMonth)
  const limitCents = group?.limits[months.indexOf(limitFrom)] ?? null

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
          <FieldLabel htmlFor={`${idPrefix}-limit-from`}>Vale a partir de</FieldLabel>
          <Select
            name="limitFrom"
            items={months.map((month) => ({ value: month, label: monthLabel(month) }))}
            value={limitFrom}
            onValueChange={(value) => setLimitFrom(value as string)}
            required
          >
            <SelectTrigger id={`${idPrefix}-limit-from`} className="w-full first-letter:uppercase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month} value={month} className="first-letter:uppercase">
                  {monthLabel(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-limit`}>Limite por mês (opcional)</FieldLabel>
          {/* Remonta ao trocar o mês para mostrar o limite que vale nele. */}
          <AmountInput
            key={limitFrom}
            id={`${idPrefix}-limit`}
            name="monthlyLimit"
            max={100_000_000}
            placeholder="R$ 0,00"
            defaultValue={limitCents}
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

export function CreateExpenseGroupSheet({ workspaceId, owner, icons, limitMonths }: Props) {
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
          limitMonths={limitMonths}
          action={(prev, formData) => createExpenseGroupAction(workspaceId, owner, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

export function ExpenseGroupActions({ workspaceId, owner, icons, limitMonths, group }: Props & { group: Group }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExpenseGroupAction(workspaceId, owner, group.id)
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
            description="Altere o nome, o limite e o ícone deste grupo. O limite novo vale do mês escolhido em diante."
            submitLabel={["Salvar", "Salvando..."]}
            group={group}
            icons={icons}
            limitMonths={limitMonths}
            action={(prev, formData) => updateExpenseGroupAction(workspaceId, owner, group.id, prev, formData)}
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
