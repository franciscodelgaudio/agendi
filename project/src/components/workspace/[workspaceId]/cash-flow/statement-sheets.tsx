"use client"

import { useActionState, useState, useTransition } from "react"
import { BanknoteIcon, CheckIcon, EllipsisIcon, LockIcon, Undo2Icon } from "lucide-react"
import {
  closeStatementAction,
  closeWalletStatementAction,
  deleteStatementAction,
  payStatementAction,
  settleReceivableAction,
  type StatementFormState,
} from "@/lib/actions/statement"
import { DayField } from "@/components/shared/day-field"
import { currencyFormat } from "@/components/shared/service-format"
import { todayInBrasilia } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { parsePassOnBps, passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import type {
  PendingByUnit,
  PendingReceivable,
  StatementListItem,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

function PassOnFields({ idPrefix, grossCents }: { idPrefix: string; grossCents: number }) {
  const [passOn, setPassOn] = useState("100")
  const bps = parsePassOnBps(passOn)

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-pass-on`}>Repasse</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`${idPrefix}-pass-on`}
            name="passOn"
            inputMode="decimal"
            value={passOn}
            onChange={(event) => setPassOn(event.target.value)}
            aria-invalid={bps === null}
            required
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>%</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <dt className="text-muted-foreground">Bruto</dt>
        <dd className="text-right tabular-nums">{money(grossCents)}</dd>
        <dt className="font-medium">Entra na carteira</dt>
        <dd className="text-right font-semibold tabular-nums">{bps === null ? "—" : money(passOnCents(grossCents, bps))}</dd>
      </dl>
    </>
  )
}

function useSheetAction(action: (prev: StatementFormState, formData: FormData) => Promise<StatementFormState>) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: StatementFormState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )
  return { open, setOpen, state, formAction, pending }
}

const ALL_UNITS = "all"

type CloseTarget =
  | { kind: "unit"; unitId: string; pendingCount: number; pendingCents: number }
  | { kind: "wallet"; walletId: string; units: PendingByUnit[] }

function ScopeField({ units, value, onChange }: { units: PendingByUnit[]; value: string; onChange: (value: string) => void }) {
  const total = units.reduce((sum, unit) => ({ count: sum.count + unit.count, cents: sum.cents + unit.cents }), { count: 0, cents: 0 })
  const items = [
    { value: ALL_UNITS, label: `Todas as unidades · ${money(total.cents)}` },
    ...units
      .filter((unit) => unit.unitId)
      .map((unit) => ({ value: unit.unitId!, label: `${unit.unitName ?? "Unidade excluída"} · ${money(unit.cents)}` })),
  ]

  return (
    <Field>
      <input type="hidden" name="unitId" value={value === ALL_UNITS ? "" : value} />
      <FieldLabel htmlFor="close-statement-scope">Unidades</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => onChange(next as string)}>
        <SelectTrigger id="close-statement-scope" className="w-full">
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
    </Field>
  )
}

function pendingOf(target: CloseTarget, scope: string) {
  if (target.kind === "unit") return { count: target.pendingCount, cents: target.pendingCents }
  const units = scope === ALL_UNITS ? target.units : target.units.filter((unit) => unit.unitId === scope)
  return units.reduce((sum, unit) => ({ count: sum.count + unit.count, cents: sum.cents + unit.cents }), { count: 0, cents: 0 })
}

export function CloseStatementSheet({
  workspaceId,
  target,
  primary,
}: {
  workspaceId: string
  target: CloseTarget
  primary: boolean
}) {
  const [paid, setPaid] = useState(false)
  const [scope, setScope] = useState(ALL_UNITS)
  const { open, setOpen, state, formAction, pending } = useSheetAction((prev, formData) =>
    target.kind === "unit"
      ? closeStatementAction(workspaceId, target.unitId, prev, formData)
      : closeWalletStatementAction(workspaceId, target.walletId, prev, formData),
  )
  const today = todayInBrasilia()
  const totalPending = pendingOf(target, ALL_UNITS).count
  const selected = pendingOf(target, scope)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant={primary ? "default" : "outline"} disabled={totalPending === 0} />}>
        <LockIcon />
        Fechar período
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Fechar período</SheetTitle>
            <SheetDescription>
              Junta os {selected.count} recebíveis pendentes{target.kind === "unit" ? " desta unidade" : ""} num fechamento e
              aplica a porcentagem do repasse.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <Field>
              <FieldLabel htmlFor="close-statement-name">Nome</FieldLabel>
              <Input
                id="close-statement-name"
                name="name"
                defaultValue={`Repasse até ${dayFormat.format(new Date())}`}
                maxLength={80}
                autoFocus
                required
              />
            </Field>
            {target.kind === "wallet" && <ScopeField units={target.units} value={scope} onChange={setScope} />}
            <PassOnFields idPrefix="close-statement" grossCents={selected.cents} />
            <Label className="gap-2 font-normal">
              <Checkbox checked={paid} onCheckedChange={setPaid} />
              Já recebido
            </Label>
            {paid && <DayField id="close-statement-paid-at" name="paidAt" label="Recebido em" defaultValue={today} />}
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Fechando..." : "Fechar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

type SettleReceivable = Pick<PendingReceivable, "id" | "name" | "valueCents">

function SettleReceivableContent({
  workspaceId,
  receivable,
  onSettled,
  onDismiss,
}: {
  workspaceId: string
  receivable: SettleReceivable
  onSettled: () => void
  onDismiss?: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: StatementFormState, formData: FormData) => {
      const next = await settleReceivableAction(workspaceId, receivable.id, prev, formData)
      if (!next.error) onSettled()
      return next
    },
    { error: null },
  )

  return (
    <SheetContent>
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>Confirmar pagamento</SheetTitle>
          <SheetDescription>
            <strong>{receivable.name}</strong> vira uma entrada na carteira com a porcentagem do repasse.
          </SheetDescription>
        </SheetHeader>
        <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
          {state.error && <FieldError>{state.error}</FieldError>}
          <PassOnFields idPrefix={`settle-${receivable.id}`} grossCents={receivable.valueCents} />
          <DayField id={`settle-${receivable.id}-paid-at`} name="paidAt" label="Recebido em" defaultValue={todayInBrasilia()} />
        </FieldGroup>
        <SheetFooter>
          <Button type="submit" loading={pending}>
            {pending ? "Confirmando..." : "Confirmar"}
          </Button>
          {onDismiss && (
            <Button type="button" variant="outline" disabled={pending} onClick={onDismiss}>
              Agora não
            </Button>
          )}
        </SheetFooter>
      </form>
    </SheetContent>
  )
}

export function SettleReceivableSheet({ workspaceId, receivable }: { workspaceId: string; receivable: PendingReceivable }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <CheckIcon />
        Confirmar pagamento
      </SheetTrigger>
      <SettleReceivableContent workspaceId={workspaceId} receivable={receivable} onSettled={() => setOpen(false)} />
    </Sheet>
  )
}

export function ConfirmPaymentSheet({
  workspaceId,
  receivable,
  onClose,
}: {
  workspaceId: string
  receivable: SettleReceivable | null
  onClose: () => void
}) {
  return (
    <Sheet open={!!receivable} onOpenChange={(next) => !next && onClose()}>
      {receivable && (
        <SettleReceivableContent workspaceId={workspaceId} receivable={receivable} onSettled={onClose} onDismiss={onClose} />
      )}
    </Sheet>
  )
}

export function StatementActions({ workspaceId, statement }: { workspaceId: string; statement: StatementListItem }) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const { open, setOpen, state, formAction, pending } = useSheetAction((prev, formData) =>
    payStatementAction(workspaceId, statement.id, prev, formData),
  )
  const netCents = passOnCents(statement.grossCents, statement.passOnBps)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${statement.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <BanknoteIcon />
            Registrar pagamento
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Undo2Icon />
            Desfazer fechamento
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>Registrar pagamento</SheetTitle>
              <SheetDescription>
                <strong>{statement.name}</strong> vira uma entrada de {money(netCents)} na carteira.
              </SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              <DayField
                id={`pay-statement-${statement.id}-paid-at`}
                name="paidAt"
                label="Recebido em"
                defaultValue={todayInBrasilia()}
              />
            </FieldGroup>
            <SheetFooter>
              <Button type="submit" loading={pending}>
                {pending ? "Registrando..." : "Registrar"}
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
            <AlertDialogTitle>Desfazer fechamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {statement.count} recebíveis de <strong>{statement.name}</strong> voltam para a lista de pendentes.
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
                  const result = await deleteStatementAction(workspaceId, statement.id)
                  setError(result.error)
                  if (!result.error) setDeleteOpen(false)
                })
              }
            >
              {deleting ? "Desfazendo..." : "Desfazer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
