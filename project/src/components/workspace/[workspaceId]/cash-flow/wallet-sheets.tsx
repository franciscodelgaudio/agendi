"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { createWalletAction, deleteWalletAction, updateWalletAction, type WalletFormState } from "@/lib/actions/wallet"
import { OpeningBalanceFields } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { WalletSettlement } from "@/service/workspace/[workspaceId]/cash-flow/wallet"

function NameField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Nome</FieldLabel>
      <Input id={id} name="name" placeholder="Conta Itaú" defaultValue={defaultValue} maxLength={40} autoFocus required />
    </Field>
  )
}

const SETTLEMENT_ITEMS = [
  { value: "immediate", label: "Na hora", description: "Cada atendimento concluído é confirmado e entra na carteira." },
  { value: "statement", label: "Por fechamento", description: "Os atendimentos acumulam e entram juntos num fechamento com repasse." },
]

function SettlementField({ id, defaultValue = "immediate" }: { id: string; defaultValue?: WalletSettlement }) {
  const [value, setValue] = useState<string>(defaultValue)

  return (
    <Field>
      <FieldLabel htmlFor={id}>Recebimento dos atendimentos</FieldLabel>
      <Select name="settlement" items={SETTLEMENT_ITEMS} value={value} onValueChange={(next) => setValue(next as string)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SETTLEMENT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{SETTLEMENT_ITEMS.find((item) => item.value === value)?.description}</p>
    </Field>
  )
}

export function CreateWalletSheet({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: WalletFormState, formData: FormData) => {
      const next = await createWalletAction(workspaceId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Nova carteira
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Nova carteira</SheetTitle>
            <SheetDescription>Conta de onde entra e sai o dinheiro de uma ou mais unidades.</SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <NameField id="create-wallet-name" />
            <SettlementField id="create-wallet-settlement" />
            <OpeningBalanceFields idPrefix="create-wallet" />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Criando..." : "Criar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

type Wallet = { id: string; name: string; settlement: WalletSettlement }

export function WalletActions({ workspaceId, wallet }: { workspaceId: string; wallet: Wallet }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [state, formAction, pending] = useActionState(
    async (prev: WalletFormState, formData: FormData) => {
      const next = await updateWalletAction(workspaceId, wallet.id, prev, formData)
      if (!next.error) setEditOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${wallet.name}`} />}>
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
              <SheetTitle>Editar carteira</SheetTitle>
              <SheetDescription>O nome aparece nas unidades e no caixa.</SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              <NameField id={`edit-wallet-${wallet.id}`} defaultValue={wallet.name} />
              <SettlementField id={`edit-wallet-${wallet.id}-settlement`} defaultValue={wallet.settlement} />
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
            <AlertDialogTitle>Excluir carteira?</AlertDialogTitle>
            <AlertDialogDescription>
              A carteira <strong>{wallet.name}</strong> será excluída. Só é possível excluir carteiras sem unidades e sem
              transações.
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
                  const result = await deleteWalletAction(workspaceId, wallet.id)
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
