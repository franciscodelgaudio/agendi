"use client"

import { useActionState, useState } from "react"
import { ArrowLeftRightIcon, LinkIcon, PlusIcon } from "lucide-react"
import { setUnitInventoryAction, setUnitWalletAction, type UnitFormState } from "@/lib/actions/unit"
import { OpeningBalanceFields } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
import { Button } from "@/components/ui/button"
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

export type RefOption = { id: string; name: string }

const NEW = "new"
const NONE = "none"

type Kind = {
  name: "wallet" | "inventory"
  action: typeof setUnitWalletAction
  title: string
  description: string
  label: string
  newLabel: string
  noneLabel: string
  newPlaceholder: string
  withBalance: boolean
}

const wallet: Kind = {
  name: "wallet",
  action: setUnitWalletAction,
  title: "Carteira da unidade",
  description: "Os atendimentos concluídos nesta unidade entram como receita na carteira escolhida.",
  label: "Carteira",
  newLabel: "Nova carteira",
  noneLabel: "Sem carteira",
  newPlaceholder: "Caixa Centro",
  withBalance: true,
}

const inventory: Kind = {
  name: "inventory",
  action: setUnitInventoryAction,
  title: "Estoque da unidade",
  description: "Escolha o estoque de produtos usado por esta unidade.",
  label: "Estoque",
  newLabel: "Novo estoque",
  noneLabel: "Sem estoque",
  newPlaceholder: "Estoque Centro",
  withBalance: false,
}

type Props = {
  workspaceId: string
  unitId: string
  options: RefOption[]
  currentId: string | null
  standalone?: boolean
  unitName?: string
  defaultId?: string
  createOnly?: boolean
}

function UnitRefSheet({ kind, standalone = false, ...props }: Props & { kind: Kind }) {
  const { currentId } = props
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
      {props.createOnly ? (
        <SheetTrigger render={<Button />}>
          <PlusIcon />
          {kind.newLabel}
        </SheetTrigger>
      ) : (
        <SheetTrigger render={<Button variant={standalone ? "outline" : "ghost"} size={standalone ? "default" : "sm"} />}>
          {currentId ? <ArrowLeftRightIcon /> : <LinkIcon />}
          {standalone ? (currentId ? `Trocar ${kind.label.toLowerCase()}` : `Vincular ${kind.label.toLowerCase()}`) : currentId ? "Trocar" : "Vincular"}
        </SheetTrigger>
      )}
      <SheetContent>
        <UnitRefForm key={formKey} kind={kind} {...props} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function UnitRefForm({
  kind,
  workspaceId,
  unitId,
  options,
  currentId,
  unitName,
  defaultId,
  createOnly = false,
  onDone,
}: Props & { kind: Kind; onDone: () => void }) {
  const [value, setValue] = useState<string | null>(createOnly ? NEW : (currentId ?? defaultId ?? (options.length ? null : NEW)))
  const [state, formAction, pending] = useActionState(
    async (prev: UnitFormState, formData: FormData) => {
      const next = await kind.action(workspaceId, unitId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const id = `unit-${unitId}-${kind.name}`
  const items = [
    ...options.map((option) => ({ value: option.id, label: option.name })),
    { value: NEW, label: kind.newLabel },
    ...(currentId ? [{ value: NONE, label: kind.noneLabel }] : []),
  ]

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        {createOnly ? (
          <>
            <SheetTitle>{unitName ? `${kind.newLabel} para ${unitName}` : kind.newLabel}</SheetTitle>
            <SheetDescription>{`O ${kind.label.toLowerCase()} é criado e já fica vinculado à unidade.`}</SheetDescription>
          </>
        ) : (
          <>
            <SheetTitle>{unitName ? `${kind.label} de ${unitName}` : kind.title}</SheetTitle>
            <SheetDescription>{kind.description}</SheetDescription>
          </>
        )}
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {createOnly ? (
          <input type="hidden" name={`${kind.name}Id`} value={NEW} />
        ) : (
          <Field>
            <FieldLabel htmlFor={id}>{kind.label}</FieldLabel>
            <Select name={`${kind.name}Id`} items={items} value={value} onValueChange={(next) => setValue(next as string)} required>
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder="Escolha" />
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
        )}
        {value === NEW && (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>Nome</FieldLabel>
              <Input id={`${id}-name`} name={`${kind.name}Name`} placeholder={kind.newPlaceholder} maxLength={40} required />
            </Field>
            {kind.withBalance && <OpeningBalanceFields idPrefix={id} />}
          </>
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

export function UnitWalletSheet(props: Props) {
  return <UnitRefSheet kind={wallet} {...props} />
}

export function UnitInventorySheet(props: Props) {
  return <UnitRefSheet kind={inventory} {...props} />
}
