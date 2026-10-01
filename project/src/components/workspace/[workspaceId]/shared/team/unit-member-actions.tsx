"use client"

import { useActionState, useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { updateUnitMemberAction, type UnitMemberFormState } from "@/lib/actions/unit-member"
import { MAX_BONUS_DESCRIPTION_LENGTH, type CommissionBase, type UnitMemberBonus } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member"

import { AmountInput } from "@/components/shared/amount-input"
import { DayField } from "@/components/shared/day-field"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const commissionBaseItems: { value: CommissionBase; label: string }[] = [
  { value: "services", label: "Sobre os serviços que a pessoa fez" },
  { value: "gross", label: "Sobre o faturamento bruto da unidade" },
]

// Comissão, salário e bônus combináveis; null/vazio enquanto não foi definido.
export type UnitMemberLink = {
  unitId: string
  unitName: string
  // A do vínculo; em vínculos antigos, a da função (quem realiza atendimentos: serviços).
  commissionBase: CommissionBase
  // "2026-02-15"
  startDate: string | null
  payDay: number | null
  commissionPercent: number | null
  salaryCents: number | null
  bonuses: UnitMemberBonus[]
}

type Member = { id: string; label: string }

// Valor em centavos.
type Bonus = { key: number; description: string; amount: number | null }

type FormProps = { workspaceId: string; member: Member; link: UnitMemberLink }

// Uma unidade: o lápis abre direto; várias: um menu para escolher a unidade.
export function UnitMemberActions({ workspaceId, member, links }: { workspaceId: string; member: Member; links: UnitMemberLink[] }) {
  const [link, setLink] = useState<UnitMemberLink | null>(null)
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  function edit(next: UnitMemberLink) {
    setLink(next)
    setFormKey((k) => k + 1)
    setOpen(true)
  }

  return (
    <>
      {links.length === 1 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar remuneração de ${member.label} em ${links[0].unitName}`}
          onClick={() => edit(links[0])}
        >
          <PencilIcon />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Editar remuneração de ${member.label}`} />}
          >
            <PencilIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {links.map((item) => (
              <DropdownMenuItem key={item.unitId} onClick={() => edit(item)}>
                {item.unitName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          {link && (
            <UnitMemberForm key={formKey} workspaceId={workspaceId} member={member} link={link} onDone={() => setOpen(false)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function UnitMemberForm({ workspaceId, member, link, onDone }: FormProps & { onDone: () => void }) {
  const [bonuses, setBonuses] = useState<Bonus[]>(() =>
    link.bonuses.map((bonus, key) => ({ key, description: bonus.description, amount: bonus.amountCents })),
  )
  const [state, formAction, pending] = useActionState(
    async (prev: UnitMemberFormState, formData: FormData) => {
      const next = await updateUnitMemberAction(workspaceId, link.unitId, member.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = `unit-member-${member.id}-${link.unitId}`

  function updateBonus(key: number, patch: Partial<Bonus>) {
    setBonuses((current) => current.map((bonus) => (bonus.key === key ? { ...bonus, ...patch } : bonus)))
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{member.label}</SheetTitle>
        <SheetDescription>Remuneração em {link.unitName}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <DayField
          id={`${idPrefix}-start`}
          name="startDate"
          label="Início na unidade"
          placeholder="Sem data"
          defaultValue={link.startDate ?? ""}
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
            defaultValue={link.payDay ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-commission`}>Comissão</FieldLabel>
          <AmountInput
            id={`${idPrefix}-commission`}
            mode="percent"
            name="commissionPercent"
            max={10_000}
            placeholder="0,00%"
            defaultValue={link.commissionPercent === null ? null : Math.round(link.commissionPercent * 100)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-commission-base`}>Base da comissão</FieldLabel>
          <Select name="commissionBase" items={commissionBaseItems} defaultValue={link.commissionBase}>
            <SelectTrigger id={`${idPrefix}-commission-base`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {commissionBaseItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-salary`}>Salário mensal</FieldLabel>
          <AmountInput id={`${idPrefix}-salary`} name="salary" placeholder="R$ 0,00" defaultValue={link.salaryCents} />
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
