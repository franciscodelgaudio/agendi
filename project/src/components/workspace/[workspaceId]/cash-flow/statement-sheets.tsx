"use client"

import { useActionState, useState, useTransition } from "react"
import { BanknoteIcon, CheckIcon, EllipsisIcon, LockIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import {
  closeStatementAction,
  deleteStatementAction,
  payStatementAction,
  settleReceivableAction,
  type StatementFormState,
} from "@/lib/actions/statement"
import { DayField, toDate } from "@/components/shared/day-field"
import { todayInBrasilia } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
import { money, percent, tierLabel } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
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
import {
  closedPeriodOverlaps,
  netCents,
  passOnCents,
  pendingInPeriod,
  suggestedPeriod,
  type ClosePeriod,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import { appliedTierIndex } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"
import type {
  PendingDay,
  PendingReceivable,
  StatementListItem,
  StatementPeriod,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import type { UnitPartner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"

const shortDayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })

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

const PERIOD_ITEMS = [
  { value: "range", label: "De/até" },
  { value: "until", label: "Todos os pendentes até uma data" },
]

export type ClosablePartner = UnitPartner & { unitId: string; periods: StatementPeriod[] }

function isFullMonth({ from, to }: { from: string; to: string }) {
  const next = toDate(to)
  next.setDate(next.getDate() + 1)
  return from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7) && next.getDate() === 1
}

function periodName(partner: ClosablePartner, period: ClosePeriod) {
  if (period.period === "until") return `${partner.name} · até ${dayFormat.format(toDate(period.to))}`
  if (isFullMonth(period)) return `${partner.name} · ${monthFormat.format(toDate(period.from))}`
  return `${partner.name} · ${shortDayFormat.format(toDate(period.from))} a ${shortDayFormat.format(toDate(period.to))}`
}

function initialPeriod(partner: ClosablePartner, today: string): ClosePeriod {
  const lastTo = partner.periods.at(-1)?.to ?? null
  return { unitId: partner.unitId, period: "range", ...suggestedPeriod(lastTo, today) }
}

function PeriodFields({
  value,
  version,
  today,
  onChange,
}: {
  value: ClosePeriod
  version: number
  today: string
  onChange: (value: ClosePeriod, preset?: boolean) => void
}) {
  const presets = [
    { label: "Mês passado", period: suggestedPeriod(null, today) },
    { label: "Este mês", period: { from: `${today.slice(0, 8)}01`, to: today } },
  ]

  return (
    <>
      <Field>
        <input type="hidden" name="period" value={value.period} />
        <FieldLabel htmlFor="close-statement-period">Período</FieldLabel>
        <Select
          items={PERIOD_ITEMS}
          value={value.period}
          onValueChange={(next) => onChange({ ...value, period: next as ClosePeriod["period"] })}
        >
          <SelectTrigger id="close-statement-period" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value.period === "range" ? (
        <>
          <div key={version} className="grid grid-cols-2 gap-4">
            <DayField
              id="close-statement-from"
              name="from"
              label="De"
              defaultValue={value.from}
              onChange={(from) => onChange({ ...value, from })}
            />
            <DayField id="close-statement-to" name="to" label="Até" defaultValue={value.to} onChange={(to) => onChange({ ...value, to })} />
          </div>
          <div className="flex gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...value, ...preset.period }, true)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <DayField
          key={version}
          id="close-statement-to"
          name="to"
          label="Até"
          defaultValue={value.to}
          onChange={(to) => onChange({ ...value, to })}
        />
      )}
    </>
  )
}

function PartnerField({ partners, value, onChange }: { partners: ClosablePartner[]; value: string; onChange: (id: string) => void }) {
  const items = partners.map((partner) => ({ value: partner.id, label: partner.name }))

  return (
    <Field>
      <FieldLabel htmlFor="close-statement-partner">Parceiro</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => onChange(next as string)}>
        <SelectTrigger id="close-statement-partner" className="w-full">
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

function CloseSummary({ partner, count, grossCents }: { partner: ClosablePartner; count: number; grossCents: number }) {
  const index = appliedTierIndex(partner, grossCents)
  const tier = partner.tiers[index]
  const next = partner.tiers.at(index + 1)
  const shareCents = passOnCents(grossCents, tier.shareBps)

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <dt className="text-muted-foreground">{count === 1 ? "1 atendimento" : `${count} atendimentos`}</dt>
        <dd className="text-right tabular-nums">{money(grossCents)}</dd>
        <dt className="text-muted-foreground">Faixa</dt>
        <dd className="text-right">{tierLabel(partner.thresholdRule, tier, index)}</dd>
        <dt className="text-muted-foreground">Fica com {partner.name}</dt>
        <dd className="text-right tabular-nums">−{money(shareCents)}</dd>
        <dt className="border-t pt-1 font-medium">Você recebe</dt>
        <dd className="border-t pt-1 text-right font-semibold tabular-nums">{money(grossCents - shareCents)}</dd>
      </dl>
      {next && (
        <p className="text-xs text-muted-foreground">
          Faltam {money(next.thresholdCents - grossCents + (partner.thresholdRule === "above" ? 1 : 0))} para a faixa de{" "}
          {percent(next.shareBps)}.
        </p>
      )}
    </div>
  )
}

function OverlapWarning({ overlaps }: { overlaps: { name: string; count: number; cents: number }[] }) {
  if (overlaps.length === 0) return null
  return (
    <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <ul className="flex flex-col gap-1">
        {overlaps.map((overlap) => (
          <li key={overlap.name}>
            {overlap.count === 1 ? "1 atendimento" : `${overlap.count} atendimentos`} ({money(overlap.cents)}){" "}
            {overlap.count === 1 ? "é de um dia já coberto" : "são de dias já cobertos"} por <strong>{overlap.name}</strong>. Eles
            entram neste fechamento e contam para a faixa dele.
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CloseStatementSheet({
  workspaceId,
  partners,
  days,
}: {
  workspaceId: string
  partners: ClosablePartner[]
  days: PendingDay[]
}) {
  const today = todayInBrasilia()
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "")
  const partner = partners.find((item) => item.id === partnerId) ?? partners[0]
  const [period, setPeriod] = useState<ClosePeriod>(() =>
    partner ? initialPeriod(partner, today) : { unitId: null, period: "range", from: today, to: today },
  )
  const [version, setVersion] = useState(0)
  const [name, setName] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const { open, setOpen, state, formAction, pending } = useSheetAction((prev, formData) =>
    closeStatementAction(workspaceId, partner.id, prev, formData),
  )

  if (!partner) return null

  function reset(next: ClosablePartner) {
    setPartnerId(next.id)
    setPeriod(initialPeriod(next, today))
    setVersion((current) => current + 1)
    setName(null)
    setPaid(false)
  }

  const selected = pendingInPeriod(days, period)
  const overlaps = closedPeriodOverlaps(days, period, partner.periods)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) reset(partner)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <LockIcon />
        Fechar período
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Fechar período</SheetTitle>
            <SheetDescription>
              Junta os atendimentos pendentes do período e calcula a parte de <strong>{partner.name}</strong> pela faixa do bruto.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            {partners.length > 1 && (
              <PartnerField partners={partners} value={partner.id} onChange={(id) => reset(partners.find((item) => item.id === id)!)} />
            )}
            <PeriodFields
              value={period}
              version={version}
              today={today}
              onChange={(next, preset) => {
                setPeriod(next)
                if (preset) setVersion((current) => current + 1)
              }}
            />
            <Field>
              <FieldLabel htmlFor="close-statement-name">Nome</FieldLabel>
              <Input
                id="close-statement-name"
                name="name"
                value={name ?? periodName(partner, period)}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <OverlapWarning overlaps={overlaps} />
            {selected.count > 0 ? (
              <CloseSummary partner={partner} count={selected.count} grossCents={selected.cents} />
            ) : (
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Nenhum atendimento pendente neste período.
              </p>
            )}
            <Label className="gap-2 font-normal">
              <Checkbox checked={paid} onCheckedChange={setPaid} />
              Já recebido
            </Label>
            {paid && <DayField id="close-statement-paid-at" name="paidAt" label="Recebido em" defaultValue={today} />}
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending} disabled={selected.count === 0}>
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
            <strong>{receivable.name}</strong> entra na carteira como recebido: {money(receivable.valueCents)}.
          </SheetDescription>
        </SheetHeader>
        <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
          {state.error && <FieldError>{state.error}</FieldError>}
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
  const net = netCents(statement.grossCents, statement.shareBps)

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
                <strong>{statement.name}</strong> vira uma entrada de {money(net)} na carteira.
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
              {statement.count === 1 ? "O atendimento" : `Os ${statement.count} atendimentos`} de <strong>{statement.name}</strong>{" "}
              {statement.count === 1 ? "volta" : "voltam"} para a lista de pendentes.
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
