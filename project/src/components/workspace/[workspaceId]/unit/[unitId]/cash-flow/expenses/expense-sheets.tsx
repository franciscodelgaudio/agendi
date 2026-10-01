"use client"

import { useActionState, useState, useTransition } from "react"
import { CheckIcon, ClockIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createExpenseAction,
  deleteExpenseAction,
  setExpensePaidAction,
  updateExpenseAction,
  type ExpenseActionState,
} from "@/lib/actions/expense"
import type { ExpenseGroupIcon } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon"

import { AmountInput } from "@/components/shared/amount-input"
import { DayField } from "@/components/shared/day-field"
import { ExpenseGroupLabel } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type ExpenseGroupOption = { id: string; name: string; icon: ExpenseGroupIcon | null }
export type ExpenseRow = {
  id: string
  groupId: string
  description: string
  amountCents: number
  date: string
  paid: boolean
  // null quando a despesa é à vista.
  series: { kind: "installments" | "recurring"; number: number; count: number } | null
}

type Repeat = "none" | "installments" | "recurring"

const repeatItems = [
  { value: "none", label: "À vista" },
  { value: "installments", label: "Parcelada" },
  { value: "recurring", label: "Todo mês" },
]
const amountLabels: Record<Repeat, string> = { none: "Valor", installments: "Valor total", recurring: "Valor por mês" }
const scopeItems = [
  { value: "this", label: "Só esta" },
  { value: "following", label: "Esta e as próximas" },
]

type Props = { workspaceId: string; unitId: string; groups: ExpenseGroupOption[] }

function ExpenseForm({
  title,
  description,
  submitLabel,
  groups,
  expense,
  defaultDate,
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  groups: ExpenseGroupOption[]
  expense?: ExpenseRow
  defaultDate: string
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
  const idPrefix = expense ? `edit-expense-${expense.id}` : "create-expense"
  const [repeat, setRepeat] = useState<Repeat>("none")
  const [scope, setScope] = useState("this")

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-description`}>Descrição</FieldLabel>
          <Input
            id={`${idPrefix}-description`}
            name="description"
            placeholder="DAS de setembro"
            defaultValue={expense?.description}
            maxLength={80}
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-group`}>Grupo</FieldLabel>
          <Select
            name="groupId"
            items={groups.map((group) => ({ value: group.id, label: group.name }))}
            defaultValue={expense?.groupId ?? (groups.length === 1 ? groups[0].id : undefined)}
            required
          >
            <SelectTrigger id={`${idPrefix}-group`} className="w-full">
              <SelectValue placeholder="Escolha o grupo">
                {(value: string | null) => {
                  const group = groups.find((option) => option.id === value)
                  return group ? <ExpenseGroupLabel group={group} /> : "Escolha o grupo"
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  <ExpenseGroupLabel group={group} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {!expense && (
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-repeat`}>Pagamento</FieldLabel>
              <Select
                name="repeat"
                items={repeatItems}
                value={repeat}
                onValueChange={(value) => setRepeat((value as Repeat | null) ?? "none")}
              >
                <SelectTrigger id={`${idPrefix}-repeat`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {repeatItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {repeat !== "none" && (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-count`}>
                  {repeat === "installments" ? "Parcelas" : "Meses"}
                </FieldLabel>
                <Input
                  id={`${idPrefix}-count`}
                  name="count"
                  type="number"
                  min={2}
                  max={60}
                  step={1}
                  placeholder="12"
                  required
                />
              </Field>
            )}
          </div>
        )}
        {expense?.series && (
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-scope`}>Alterar</FieldLabel>
            <Select name="scope" items={scopeItems} value={scope} onValueChange={(value) => setScope(value ?? "this")}>
              <SelectTrigger id={`${idPrefix}-scope`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-amount`}>{amountLabels[repeat]}</FieldLabel>
            <AmountInput
              id={`${idPrefix}-amount`}
              name="amount"
              max={100_000_000}
              placeholder="R$ 0,00"
              defaultValue={expense?.amountCents}
              required
            />
          </Field>
          {/* Nas próximas da série, cada despesa mantém o seu dia. */}
          {scope === "this" ? (
            <DayField
              id={`${idPrefix}-date`}
              name="date"
              label={repeat === "none" ? "Dia" : "Primeiro mês"}
              defaultValue={expense?.date ?? defaultDate}
            />
          ) : (
            <input type="hidden" name="date" value={expense!.date} />
          )}
        </div>
        {!expense && (
          <Field orientation="horizontal">
            <Checkbox id={`${idPrefix}-paid`} name="paid" />
            <FieldLabel htmlFor={`${idPrefix}-paid`}>Já foi paga</FieldLabel>
          </Field>
        )}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? submitLabel[1] : submitLabel[0]}
        </Button>
      </SheetFooter>
    </form>
  )
}

// defaultDate: dia sugerido para a nova despesa (hoje, ou o primeiro dia do mês exibido).
export function CreateExpenseSheet({ workspaceId, unitId, groups, defaultDate }: Props & { defaultDate: string }) {
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((key) => key + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Lançar despesa
      </SheetTrigger>
      <SheetContent>
        <ExpenseForm
          key={formKey}
          title="Lançar despesa"
          description="Despesa da unidade que entra no caixa."
          submitLabel={["Lançar", "Lançando..."]}
          groups={groups}
          defaultDate={defaultDate}
          action={(prev, formData) => createExpenseAction(workspaceId, unitId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

// Badge de pagamento que alterna ao clicar; o erro aparece num tooltip sobre o badge até ser dispensado.
export function ExpensePaidToggle({
  workspaceId,
  unitId,
  expense,
  disabled,
}: {
  workspaceId: string
  unitId: string
  expense: ExpenseRow
  disabled: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const checked = optimistic ?? expense.paid

  const label = checked ? (
    <>
      <CheckIcon data-icon="inline-start" />
      Paga
    </>
  ) : (
    <>
      <ClockIcon data-icon="inline-start" />
      Pendente
    </>
  )
  const variant = checked ? "default" : "outline"

  const box = disabled ? (
    <Badge variant={variant}>{label}</Badge>
  ) : (
    <Badge
      variant={variant}
      render={
        <button
          type="button"
          aria-pressed={checked}
          aria-label={`${expense.description}: marcar como ${checked ? "pendente" : "paga"}`}
          disabled={pending}
          className="cursor-pointer hover:opacity-80 disabled:cursor-default disabled:opacity-50"
          onClick={() => {
            const next = !checked
            setOptimistic(next)
            startTransition(async () => {
              const result = await setExpensePaidAction(workspaceId, unitId, expense.id, next)
              setError(result.error)
              setOptimistic(null)
            })
          }}
        />
      }
    >
      {label}
    </Badge>
  )
  if (!error) return box
  return (
    <Tooltip open onOpenChange={(open) => !open && setError(null)}>
      <TooltipTrigger render={<span />}>{box}</TooltipTrigger>
      <TooltipContent>{error}</TooltipContent>
    </Tooltip>
  )
}

export function ExpenseActions({ workspaceId, unitId, groups, expense }: Props & { expense: ExpenseRow }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete(scope: "this" | "following") {
    startTransition(async () => {
      const result = await deleteExpenseAction(workspaceId, unitId, expense.id, scope)
      setError(result.error)
      if (!result.error) setDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${expense.description}`} />}
        >
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
          <ExpenseForm
            key={editKey}
            title="Editar despesa"
            description="Altere os dados desta despesa."
            submitLabel={["Salvar", "Salvando..."]}
            groups={groups}
            expense={expense}
            defaultDate={expense.date}
            action={(prev, formData) => updateExpenseAction(workspaceId, unitId, expense.id, prev, formData)}
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
            <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              A despesa <strong>{expense.description}</strong> será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            {expense.series ? (
              <>
                <Button variant="outline" onClick={() => handleDelete("this")} disabled={pending}>
                  Só esta
                </Button>
                <Button variant="destructive" onClick={() => handleDelete("following")} loading={pending}>
                  Esta e as próximas
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => handleDelete("this")} loading={pending}>
                {pending ? "Excluindo..." : "Excluir"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
