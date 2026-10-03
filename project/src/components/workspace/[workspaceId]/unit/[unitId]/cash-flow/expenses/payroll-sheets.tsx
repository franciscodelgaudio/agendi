"use client"

import { useActionState, useState, useTransition } from "react"
import { CheckIcon, ClockIcon, EllipsisIcon, PencilIcon, RotateCcwIcon } from "lucide-react"
import { recordPayrollPaymentAction, removePayrollPaymentAction, type PayrollActionState } from "@/lib/actions/payroll"
import type { ExpenseRow, PayrollValues } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense-sheets"

import { AmountInput } from "@/components/shared/amount-input"
import { DayField, toDay } from "@/components/shared/day-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })

type Props = { workspaceId: string; unitId: string; expense: ExpenseRow & { payroll: PayrollValues } }

// Mês trabalhado da linha ("2026-10"): as linhas da folha ficam no último dia dele.
function monthOf(expense: ExpenseRow) {
  return expense.date.slice(0, 7)
}

function payrollForm(values: { salaryCents: number; commissionCents: number; paidOn: string }) {
  const formData = new FormData()
  formData.set("salary", (values.salaryCents / 100).toFixed(2))
  formData.set("commission", (values.commissionCents / 100).toFixed(2))
  formData.set("paidOn", values.paidOn)
  return formData
}

// Status da folha que alterna ao clicar: marcar como paga grava os valores da linha com o dia de
// hoje; desmarcar mantém os valores como ajuste. O erro aparece num tooltip até ser dispensado.
export function PayrollPaidToggle({ workspaceId, unitId, expense, disabled }: Props & { disabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const checked = optimistic ?? expense.paid
  const { memberId, salaryCents, commissionCents } = expense.payroll

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
              const formData = payrollForm({ salaryCents, commissionCents, paidOn: next ? toDay(new Date()) : "" })
              const result = await recordPayrollPaymentAction(workspaceId, unitId, memberId, monthOf(expense), { error: null }, formData)
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

function PayrollForm({
  name,
  month,
  payroll,
  action,
  onDone,
}: {
  name: string
  month: string
  payroll: PayrollValues
  action: (prev: PayrollActionState, formData: FormData) => Promise<PayrollActionState>
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: PayrollActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const [paid, setPaid] = useState(!!payroll.paidOn)
  const idPrefix = `payroll-${payroll.memberId}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Folha de {name}</SheetTitle>
        <SheetDescription>
          Remuneração de {monthFormat.format(new Date(`${month}-01T00:00:00Z`))}. Os valores informados valem no caixa no
          lugar dos calculados.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-salary`}>Salário e bônus</FieldLabel>
            <AmountInput
              id={`${idPrefix}-salary`}
              name="salary"
              max={100_000_000}
              placeholder="R$ 0,00"
              defaultValue={payroll.salaryCents || undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-commission`}>Comissão</FieldLabel>
            <AmountInput
              id={`${idPrefix}-commission`}
              name="commission"
              max={100_000_000}
              placeholder="R$ 0,00"
              defaultValue={payroll.commissionCents || undefined}
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Checkbox id={`${idPrefix}-paid`} checked={paid} onCheckedChange={(checked) => setPaid(!!checked)} />
          <FieldLabel htmlFor={`${idPrefix}-paid`}>Já foi paga</FieldLabel>
        </Field>
        {paid ? (
          <DayField
            id={`${idPrefix}-paid-on`}
            name="paidOn"
            label="Dia do pagamento"
            defaultValue={payroll.paidOn ?? toDay(new Date())}
          />
        ) : (
          <input type="hidden" name="paidOn" value="" />
        )}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

// Editar a folha da pessoa no mês e, com registro, voltar ao valor calculado.
export function PayrollActions({ workspaceId, unitId, expense }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { payroll } = expense
  const month = monthOf(expense)
  const name = expense.description.split(" · ").slice(1).join(" · ")

  function handleReset() {
    startTransition(async () => {
      const result = await removePayrollPaymentAction(workspaceId, unitId, payroll.memberId, month)
      setError(result.error)
    })
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${expense.description}`} disabled={pending} />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => {
            setEditKey((key) => key + 1)
            setEditOpen(true)
          }}
        >
          <PencilIcon />
          Editar
        </DropdownMenuItem>
        {payroll.recorded && (
          <DropdownMenuItem onClick={handleReset}>
            <RotateCcwIcon />
            Voltar ao calculado
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      {error ? (
        <Tooltip open onOpenChange={(open) => !open && setError(null)}>
          <TooltipTrigger render={<span />}>{menu}</TooltipTrigger>
          <TooltipContent>{error}</TooltipContent>
        </Tooltip>
      ) : (
        menu
      )}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <PayrollForm
            key={editKey}
            name={name}
            month={month}
            payroll={payroll}
            action={(prev, formData) => recordPayrollPaymentAction(workspaceId, unitId, payroll.memberId, month, prev, formData)}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
