"use client"

import { useActionState, useState, useTransition } from "react"
import { CheckIcon, CircleAlertIcon, ClipboardCheckIcon, EllipsisIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import {
  closeStatementAction,
  deleteStatementAction,
  settleReceivableAction,
  type StatementFormState,
} from "@/lib/actions/statement"
import { DayField, toDate } from "@/components/shared/day-field"
import { todayInBrasilia } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
import { money, tierLabel } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { parseMoneyCents } from "@/service/_shared/money"
import {
  closedPeriodOverlaps,
  daysInPeriod,
  netCents,
  passOnCents,
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

function periodName(period: ClosePeriod) {
  if (period.period === "until") return `Repasse até ${dayFormat.format(toDate(period.to))}`
  if (isFullMonth(period)) return `Repasse de ${monthFormat.format(toDate(period.from))}`
  return `Repasse de ${shortDayFormat.format(toDate(period.from))} a ${shortDayFormat.format(toDate(period.to))}`
}

function initialPeriod(partner: ClosablePartner, today: string): ClosePeriod {
  const lastTo = partner.periods.at(-1)?.to ?? null
  return { unitId: partner.unitId, period: "range", ...suggestedPeriod(lastTo, today) }
}

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",")
}

function plural(count: number) {
  return count === 1 ? "1 atendimento" : `${count} atendimentos`
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
        <FieldLabel htmlFor="close-statement-period">Período do repasse</FieldLabel>
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

function PeriodDays({ days, count, cents }: { days: PendingDay[]; count: number; cents: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Atendimentos do período</span>
        <span className="text-muted-foreground tabular-nums">
          {plural(count)} · {money(cents)}
        </span>
      </div>
      {days.length === 0 ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Nenhum atendimento pendente neste período.</p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
          {days.map((day) => (
            <li key={`${day.unitId}-${day.day}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="tabular-nums">{dayFormat.format(toDate(day.day))}</span>
              <span className="ml-auto text-muted-foreground">{plural(day.count)}</span>
              <span className="w-24 text-right tabular-nums">{money(day.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Falta algum ou tem um a mais? Corrija na Agenda antes de confirmar.</p>
    </div>
  )
}

function ExpectedSummary({ partner, grossCents }: { partner: ClosablePartner; grossCents: number }) {
  const index = appliedTierIndex(partner, grossCents)
  const tier = partner.tiers[index]
  const shareCents = passOnCents(grossCents, tier.shareBps)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Quanto {partner.name} deve repassar</span>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <dt className="text-muted-foreground">Bruto dos atendimentos</dt>
        <dd className="text-right tabular-nums">{money(grossCents)}</dd>
        <dt className="text-muted-foreground">
          Parte de {partner.name} ({tierLabel(partner.thresholdRule, tier, index)})
        </dt>
        <dd className="text-right tabular-nums">−{money(shareCents)}</dd>
        <dt className="border-t pt-1 font-medium">Esperado</dt>
        <dd className="border-t pt-1 text-right font-semibold tabular-nums">{money(grossCents - shareCents)}</dd>
      </dl>
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
            {plural(overlap.count)} ({money(overlap.cents)}) {overlap.count === 1 ? "é de um dia já coberto" : "são de dias já cobertos"}{" "}
            por <strong>{overlap.name}</strong>. Eles entram neste repasse e contam para a faixa dele.
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReceivedCheck({ expectedCents, receivedCents }: { expectedCents: number; receivedCents: number | null }) {
  if (!receivedCents) return null
  const diff = receivedCents - expectedCents
  if (diff === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
        <CheckIcon className="size-4" />
        Bate com o esperado.
      </p>
    )
  }
  return (
    <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>
        <strong>
          {money(Math.abs(diff))} {diff < 0 ? "a menos" : "a mais"}
        </strong>{" "}
        que o esperado. O repasse fica registrado com essa diferença e entra na carteira o valor recebido.
      </span>
    </p>
  )
}

export function ReconcileStatementSheet({
  workspaceId,
  partners,
  days,
}: {
  workspaceId: string
  partners: ClosablePartner[]
  days: PendingDay[]
}) {
  const today = todayInBrasilia()
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "")
  const partner = partners.find((item) => item.id === partnerId) ?? partners[0]
  const [period, setPeriod] = useState<ClosePeriod>(() =>
    partner ? initialPeriod(partner, today) : { unitId: null, period: "range", from: today, to: today },
  )
  const [version, setVersion] = useState(0)
  const [name, setName] = useState<string | null>(null)
  const [received, setReceived] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: StatementFormState, formData: FormData) => {
      const next = await closeStatementAction(workspaceId, partner.id, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  if (!partner) return null

  function reset(next: ClosablePartner) {
    setPartnerId(next.id)
    setPeriod(initialPeriod(next, today))
    setVersion((current) => current + 1)
    setName(null)
    setReceived(null)
  }

  const selected = daysInPeriod(days, period)
  const count = selected.reduce((sum, day) => sum + day.count, 0)
  const grossCents = selected.reduce((sum, day) => sum + day.cents, 0)
  const overlaps = closedPeriodOverlaps(days, period, partner.periods)
  const expectedCents = count > 0 ? netCents(grossCents, partner.tiers[appliedTierIndex(partner, grossCents)].shareBps) : 0
  const receivedValue = received ?? moneyInput(expectedCents)
  const receivedCents = parseMoneyCents(receivedValue)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) reset(partner)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <ClipboardCheckIcon />
        Conferir repasse
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Conferir repasse</SheetTitle>
            <SheetDescription>
              Compare com o relatório que <strong>{partner.name}</strong> enviou junto com o pagamento e registre quanto entrou.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
            <OverlapWarning overlaps={overlaps} />
            <PeriodDays days={selected} count={count} cents={grossCents} />
            {count > 0 && <ExpectedSummary partner={partner} grossCents={grossCents} />}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="close-statement-received">Valor recebido</FieldLabel>
                <Input
                  id="close-statement-received"
                  name="received"
                  inputMode="decimal"
                  value={receivedValue}
                  onChange={(event) => setReceived(event.target.value)}
                  required
                />
              </Field>
              <DayField id="close-statement-paid-at" name="paidAt" label="Recebido em" defaultValue={today} />
            </div>
            {count > 0 && <ReceivedCheck expectedCents={expectedCents} receivedCents={receivedCents} />}
            <Field>
              <FieldLabel htmlFor="close-statement-name">Nome</FieldLabel>
              <Input
                id="close-statement-name"
                name="name"
                value={name ?? periodName(period)}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
              <FieldDescription>Aparece no extrato da carteira.</FieldDescription>
            </Field>
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending} disabled={count === 0 || !receivedCents}>
              {pending ? "Confirmando..." : `Confirmar e lançar ${money(receivedCents ?? 0)}`}
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
        <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
        Confirmar
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
  const [undoOpen, setUndoOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoing, startUndo] = useTransition()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${statement.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem variant="destructive" onClick={() => setUndoOpen(true)}>
            <Undo2Icon />
            Desfazer conferência
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={undoOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setUndoOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer conferência?</AlertDialogTitle>
            <AlertDialogDescription>
              A entrada de {money(statement.totalCents)} de <strong>{statement.name}</strong> sai da carteira e{" "}
              {statement.count === 1 ? "o atendimento volta" : `os ${statement.count} atendimentos voltam`} a ficar pendentes de
              conferência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={undoing}
              onClick={() =>
                startUndo(async () => {
                  const result = await deleteStatementAction(workspaceId, statement.id)
                  setError(result.error)
                  if (!result.error) setUndoOpen(false)
                })
              }
            >
              {undoing ? "Desfazendo..." : "Desfazer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
