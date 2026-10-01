"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createWalletAction,
  deleteWalletAction,
  updateWalletAction,
  type WalletActionState,
} from "@/lib/actions/wallet"
import type { OpeningBalance } from "@/lib/opening-balance"

import { AmountInput } from "@/components/amount-input"
import { OpeningBalanceFields } from "@/components/opening-balance-fields"
import { currencyFormat } from "@/components/service-format"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
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
import { cn } from "@/lib/utils"

// amountCents: parte do saldo inicial da unidade; null em todas quando a carteira é compartilhada.
export type WalletFormValue = {
  id: string
  name: string
  openingBalance: OpeningBalance
  units: { id: string; amountCents: number | null }[]
}

// Unidades do workspace; walletId/walletName dizem em qual carteira cada uma já está.
export type WalletUnitOption = { id: string; name: string; walletId: string | null; walletName: string | null }

type Props = { workspaceId: string; units: WalletUnitOption[] }

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

function WalletForm({
  title,
  description,
  submitLabel,
  wallet,
  units,
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  wallet?: WalletFormValue
  units: WalletUnitOption[]
  action: (prev: WalletActionState, formData: FormData) => Promise<WalletActionState>
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: WalletActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = wallet ? `edit-wallet-${wallet.id}` : "create-wallet"
  const [selected, setSelected] = useState(() => new Set(wallet?.units.map((unit) => unit.id) ?? []))
  const [distributed, setDistributed] = useState(() => !!wallet?.units.some((unit) => unit.amountCents !== null))
  const [balanceCents, setBalanceCents] = useState<number | null>(wallet?.openingBalance.amountCents ?? null)
  const [amounts, setAmounts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(wallet?.units.map((unit) => [unit.id, unit.amountCents]) ?? []),
  )
  const distributedCents = [...selected].reduce((sum, id) => sum + (amounts[id] ?? 0), 0)
  const restCents = (balanceCents ?? 0) - distributedCents

  function toggle(unitId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(unitId)
      else next.delete(unitId)
      return next
    })
  }

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
            placeholder="Itaú"
            defaultValue={wallet?.name}
            maxLength={40}
            autoFocus
            required
          />
        </Field>
        <OpeningBalanceFields
          idPrefix={idPrefix}
          defaultValue={wallet?.openingBalance}
          label="Saldo"
          required
          onAmountChange={setBalanceCents}
        />
        <FieldSet>
          <FieldLegend variant="label">Unidades</FieldLegend>
          <FieldDescription>O dinheiro que entra e sai das unidades marcadas soma no saldo desta carteira.</FieldDescription>
          <div className="grid gap-3">
            {units.map((unit) => {
              // Unidade de outra carteira precisa sair de lá antes.
              const elsewhere = unit.walletId !== null && unit.walletId !== wallet?.id
              const checked = selected.has(unit.id)
              return (
                <div key={unit.id} className="flex min-h-9 items-center gap-3">
                  <Field orientation="horizontal" className="min-w-0 flex-1">
                    <Checkbox
                      id={`${idPrefix}-unit-${unit.id}`}
                      name="unitId"
                      value={unit.id}
                      checked={checked}
                      disabled={elsewhere}
                      onCheckedChange={(next) => toggle(unit.id, next === true)}
                    />
                    <FieldLabel htmlFor={`${idPrefix}-unit-${unit.id}`} className="min-w-0 font-normal">
                      <span className="truncate">{unit.name}</span>
                      {elsewhere && (
                        <span className="shrink-0 text-xs text-muted-foreground">na carteira {unit.walletName}</span>
                      )}
                    </FieldLabel>
                  </Field>
                  {distributed && checked && (
                    <AmountInput
                      name={`unitAmount-${unit.id}`}
                      aria-label={`Valor de ${unit.name}`}
                      className="w-36"
                      max={100_000_000}
                      placeholder="R$ 0,00"
                      defaultValue={amounts[unit.id] ?? null}
                      onValueChange={(cents) => setAmounts((current) => ({ ...current, [unit.id]: cents }))}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </FieldSet>
        <Field orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-distributed`}
            name="distributed"
            checked={distributed}
            onCheckedChange={(next) => setDistributed(next === true)}
          />
          <FieldLabel htmlFor={`${idPrefix}-distributed`} className="font-normal">
            Dividir o saldo entre as unidades
          </FieldLabel>
        </Field>
        {distributed && (
          <FieldDescription className={cn(restCents < 0 && "text-destructive")}>
            {restCents < 0
              ? `A soma das unidades passa do saldo em ${money(-restCents)}.`
              : `Cada unidade passa a ter o próprio saldo: a parte dela mais o que entra e sai dela. Não distribuído: ${money(restCents)}.`}
          </FieldDescription>
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

export function CreateWalletSheet({ workspaceId, units }: Props) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para começar o formulário limpo.
  const [formKey, setFormKey] = useState(0)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((key) => key + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button size="sm" />}>
        <PlusIcon />
        Nova carteira
      </SheetTrigger>
      <SheetContent>
        <WalletForm
          key={formKey}
          title="Nova carteira"
          description="Conta do banco ou dinheiro em espécie, de uma unidade ou compartilhada entre várias."
          submitLabel={["Criar", "Criando..."]}
          units={units}
          action={(prev, formData) => createWalletAction(workspaceId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

export function WalletActions({ workspaceId, units, wallet }: Props & { wallet: WalletFormValue }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWalletAction(workspaceId, wallet.id)
      setError(result.error)
      if (!result.error) setDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${wallet.name}`} />}>
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
          <WalletForm
            key={editKey}
            title="Editar carteira"
            description="Altere o nome, o saldo e as unidades desta carteira."
            submitLabel={["Salvar", "Salvando..."]}
            wallet={wallet}
            units={units}
            action={(prev, formData) => updateWalletAction(workspaceId, wallet.id, prev, formData)}
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
            <AlertDialogTitle>Excluir carteira?</AlertDialogTitle>
            <AlertDialogDescription>
              A carteira <strong>{wallet.name}</strong> será excluída e as unidades dela ficam sem saldo em caixa. Os
              atendimentos e despesas não mudam.
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
