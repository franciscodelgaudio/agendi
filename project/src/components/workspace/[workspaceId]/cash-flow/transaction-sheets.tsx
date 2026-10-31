"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
  type WalletFormState,
} from "@/lib/actions/wallet"
import { AmountInput } from "@/components/shared/amount-input"
import { DayField } from "@/components/shared/day-field"
import { brtDay, todayInBrasilia } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { TransactionListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"

export const TRANSACTION_TYPE_LABELS = { incoming: "Entrada", expense: "Saída" } as const

const TYPE_ITEMS = [
  { value: "expense", label: TRANSACTION_TYPE_LABELS.expense },
  { value: "incoming", label: TRANSACTION_TYPE_LABELS.incoming },
]

function TransactionFields({ idPrefix, transaction }: { idPrefix: string; transaction?: TransactionListItem }) {
  const [type, setType] = useState<string>(transaction?.type ?? "expense")
  const [paid, setPaid] = useState(transaction ? transaction.paidAt !== null : true)

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Descrição</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Aluguel de outubro"
          defaultValue={transaction?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-type`}>Tipo</FieldLabel>
          <Select name="type" items={TYPE_ITEMS} value={type} onValueChange={(value) => setType(value as string)}>
            <SelectTrigger id={`${idPrefix}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-total`}>Valor</FieldLabel>
          <AmountInput
            id={`${idPrefix}-total`}
            name="total"
            max={100_000_000}
            placeholder="R$ 0,00"
            defaultValue={transaction?.totalCents}
            required
          />
        </Field>
      </div>
      <Label className="gap-2 font-normal">
        <Checkbox checked={paid} onCheckedChange={setPaid} />
        {type === "incoming" ? "Já recebida" : "Já paga"}
      </Label>
      {paid && (
        <DayField
          id={`${idPrefix}-paid-at`}
          name="paidAt"
          label={type === "incoming" ? "Recebida em" : "Paga em"}
          defaultValue={transaction?.paidAt ? brtDay(new Date(transaction.paidAt)) : todayInBrasilia()}
        />
      )}
    </>
  )
}

export function CreateTransactionSheet({ workspaceId, walletId }: { workspaceId: string; walletId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: WalletFormState, formData: FormData) => {
      const next = await createTransactionAction(workspaceId, walletId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Nova transação
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Nova transação</SheetTitle>
            <SheetDescription>Uma entrada ou saída de dinheiro desta carteira.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <TransactionFields idPrefix="create-transaction" />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Lançando..." : "Lançar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function TransactionActions({ workspaceId, transaction }: { workspaceId: string; transaction: TransactionListItem }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [state, formAction, pending] = useActionState(
    async (prev: WalletFormState, formData: FormData) => {
      const next = await updateTransactionAction(workspaceId, transaction.id, prev, formData)
      if (!next.error) setEditOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${transaction.name}`} />}>
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
              <SheetTitle>Editar transação</SheetTitle>
              <SheetDescription>Altere os dados desta transação.</SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              <TransactionFields idPrefix={`edit-transaction-${transaction.id}`} transaction={transaction} />
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
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{transaction.name}</strong> sai da carteira e do saldo. Essa ação não pode ser desfeita.
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
                  const result = await deleteTransactionAction(workspaceId, transaction.id)
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
