"use client"

import { useActionState, useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { updateUnitMemberAction, type UnitMemberFormState } from "@/lib/actions/unit-member"
import { MAX_BONUS_DESCRIPTION_LENGTH, type UnitMemberBonus } from "@/lib/unit-member"

import { AmountInput } from "@/components/amount-input"
import { DayField } from "@/components/day-field"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Comissão, salário e bônus combináveis; null/vazio enquanto não foi definido.
type Member = {
  id: string
  label: string
  // Realiza atendimentos (permissão da role): comissão sobre os próprios serviços.
  attends: boolean
  // "2026-02-15"
  startDate: string | null
  payDay: number | null
  commissionPercent: number | null
  salaryCents: number | null
  bonuses: UnitMemberBonus[]
}

// Valor em centavos.
type Bonus = { key: number; description: string; amount: number | null }

type Props = { workspaceId: string; unitId: string; unitName: string; member: Member }

export function UnitMemberActions(props: Props) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar remuneração de ${props.member.label} nesta unidade`}
        onClick={() => {
          setFormKey((k) => k + 1)
          setOpen(true)
        }}
      >
        <PencilIcon />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <UnitMemberForm key={formKey} {...props} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function UnitMemberForm({ workspaceId, unitId, unitName, member, onDone }: Props & { onDone: () => void }) {
  const [bonuses, setBonuses] = useState<Bonus[]>(() =>
    member.bonuses.map((bonus, key) => ({ key, description: bonus.description, amount: bonus.amountCents })),
  )
  const [state, formAction, pending] = useActionState(
    async (prev: UnitMemberFormState, formData: FormData) => {
      const next = await updateUnitMemberAction(workspaceId, unitId, member.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = `unit-member-${member.id}`

  function updateBonus(key: number, patch: Partial<Bonus>) {
    setBonuses((current) => current.map((bonus) => (bonus.key === key ? { ...bonus, ...patch } : bonus)))
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{member.label}</SheetTitle>
        <SheetDescription>Remuneração em {unitName}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <DayField
          id={`${idPrefix}-start`}
          name="startDate"
          label="Início na unidade"
          placeholder="Sem data"
          defaultValue={member.startDate ?? ""}
        />
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-pay-day`}>Dia de pagamento</FieldLabel>
          <Input
            id={`${idPrefix}-pay-day`}
            name="payDay"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="Ex.: 5"
            defaultValue={member.payDay ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-commission`}>
            {member.attends ? "Comissão sobre os serviços" : "Comissão sobre o bruto"}
          </FieldLabel>
          <AmountInput
            id={`${idPrefix}-commission`}
            mode="percent"
            name="commissionPercent"
            max={10_000}
            placeholder="0,00%"
            defaultValue={member.commissionPercent === null ? null : Math.round(member.commissionPercent * 100)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-salary`}>Salário mensal</FieldLabel>
          <AmountInput id={`${idPrefix}-salary`} name="salary" placeholder="R$ 0,00" defaultValue={member.salaryCents} />
        </Field>

        <FieldSeparator>Bônus mensais</FieldSeparator>
        <div className="divide-y border">
          {bonuses.map((bonus, index) => (
            // A ordem dos campos no FormData forma os pares descrição/valor.
            <div key={bonus.key} className="flex items-center gap-2 p-3">
              <Input
                name="bonusDescription"
                placeholder="Descrição"
                aria-label={`Descrição do bônus ${index + 1}`}
                maxLength={MAX_BONUS_DESCRIPTION_LENGTH}
                value={bonus.description}
                onChange={(event) => updateBonus(bonus.key, { description: event.target.value })}
                required
              />
              <AmountInput
                name="bonusAmount"
                placeholder="R$ 0,00"
                aria-label={`Valor do bônus ${index + 1}`}
                className="w-36 shrink-0"
                value={bonus.amount}
                onValueChange={(amount) => updateBonus(bonus.key, { amount })}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover bônus ${index + 1}`}
                onClick={() => setBonuses((current) => current.filter((b) => b.key !== bonus.key))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() =>
              setBonuses((current) => [
                ...current,
                { key: Math.max(-1, ...current.map((b) => b.key)) + 1, description: "", amount: null },
              ])
            }
          >
            <PlusIcon />
            Adicionar bônus
          </Button>
        </div>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
