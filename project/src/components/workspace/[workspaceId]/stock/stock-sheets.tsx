"use client"

import { useActionState, useState } from "react"
import { EllipsisIcon, ListPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  createStockAction,
  deleteStockAction,
  updateStockAction,
  type StockActionState,
} from "@/lib/actions/stock"
import { AddStockItemForm } from "@/components/workspace/[workspaceId]/unit/[unitId]/stock/add-stock-item-sheet"
import type { PayerOption } from "@/components/workspace/[workspaceId]/shared/stock/payer-field"

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
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

// walletId: carteira que paga as compras do estoque; null quando cada unidade paga as suas.
export type StockFormValue = { id: string; name: string; units: { id: string; name: string }[]; walletId: string | null }

// Unidades do workspace; stockId/stockName dizem em qual estoque cada uma já está e
// walletId/walletName, em qual carteira.
export type StockUnitOption = {
  id: string
  name: string
  stockId: string | null
  stockName: string | null
  walletId: string | null
  walletName: string | null
}

// canLinkWallet: quem gerencia o caixa pode ligar o estoque a uma carteira.
type Props = { workspaceId: string; units: StockUnitOption[]; canLinkWallet: boolean }

// Carteira em que estão todas as unidades marcadas; null quando não há uma só.
function sharedWallet(units: StockUnitOption[], checked: string[]) {
  const picked = units.filter((unit) => checked.includes(unit.id))
  const walletId = picked[0]?.walletId ?? null
  if (!walletId || !picked.every((unit) => unit.walletId === walletId)) return null
  return { id: walletId, name: picked[0].walletName ?? "" }
}

function StockForm({
  title,
  description,
  submitLabel,
  stock,
  units,
  canLinkWallet,
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  stock?: StockFormValue
  units: StockUnitOption[]
  canLinkWallet: boolean
  action: (prev: StockActionState, formData: FormData) => Promise<StockActionState>
  onDone: () => void
}) {
  const [checked, setChecked] = useState<string[]>(() => stock?.units.map((unit) => unit.id) ?? [])
  const [payByWallet, setPayByWallet] = useState(!!stock?.walletId)
  const wallet = sharedWallet(units, checked)
  const [state, formAction, pending] = useActionState(
    async (prev: StockActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = stock ? `edit-stock-${stock.id}` : "create-stock"

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
            placeholder="Estoque central"
            defaultValue={stock?.name}
            maxLength={40}
            autoFocus
            required
          />
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Unidades</FieldLegend>
          <FieldDescription>
            As unidades marcadas passam a usar uma quantidade só de cada produto. O que cada uma tem no próprio estoque
            entra aqui, somado por produto. Uma unidade que está em outro estoque compartilhado sai de lá sem levar
            nada.
          </FieldDescription>
          <div className="grid gap-3">
            {units.map((unit) => {
              const elsewhere = unit.stockId !== null && unit.stockId !== stock?.id
              return (
                <Field key={unit.id} orientation="horizontal">
                  <Checkbox
                    id={`${idPrefix}-unit-${unit.id}`}
                    name="unitId"
                    value={unit.id}
                    checked={checked.includes(unit.id)}
                    onCheckedChange={(next) =>
                      setChecked((ids) => (next ? [...ids, unit.id] : ids.filter((id) => id !== unit.id)))
                    }
                  />
                  <FieldLabel htmlFor={`${idPrefix}-unit-${unit.id}`} className="min-w-0 font-normal">
                    <span className="truncate">{unit.name}</span>
                    {elsewhere && (
                      <span className="shrink-0 text-xs text-muted-foreground">no estoque {unit.stockName}</span>
                    )}
                  </FieldLabel>
                </Field>
              )
            })}
          </div>
        </FieldSet>
        {canLinkWallet && (
          <FieldSet>
            <FieldLegend variant="label">Carteira</FieldLegend>
            <Field orientation="horizontal" data-disabled={!wallet || undefined}>
              <Checkbox
                id={`${idPrefix}-wallet`}
                name="walletId"
                value={wallet?.id ?? ""}
                checked={!!wallet && payByWallet}
                onCheckedChange={(next) => setPayByWallet(!!next)}
                disabled={!wallet}
              />
              <FieldLabel htmlFor={`${idPrefix}-wallet`} className="font-normal">
                {wallet ? `Pagar as compras pela carteira ${wallet.name}` : "Pagar as compras pela carteira"}
              </FieldLabel>
            </Field>
            <FieldDescription>
              {wallet
                ? "As compras do estoque podem sair da carteira, como despesa em conjunto das unidades, ou de uma unidade, escolhida em cada compra."
                : "Disponível quando todas as unidades marcadas estão na mesma carteira."}
            </FieldDescription>
          </FieldSet>
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

export function CreateStockSheet({ workspaceId, units, canLinkWallet }: Props) {
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
        Novo estoque
      </SheetTrigger>
      <SheetContent>
        <StockForm
          key={formKey}
          title="Novo estoque"
          description="Estoque usado por várias unidades, com uma quantidade só de cada produto para todas."
          submitLabel={["Criar", "Criando..."]}
          units={units}
          canLinkWallet={canLinkWallet}
          action={(prev, formData) => createStockAction(workspaceId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

// catalog: produtos do catálogo que ainda não estão neste estoque, para adicionar; payers: quem
// pode pagar a compra (a carteira do estoque e as unidades dele).
export function StockActions({
  workspaceId,
  units,
  canLinkWallet,
  stock,
  catalog,
  payers,
}: Props & { stock: StockFormValue; catalog: { id: string; name: string }[]; payers: PayerOption[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${stock.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {catalog.length > 0 && stock.units.length > 0 && (
            <DropdownMenuItem
              onClick={() => {
                setFormKey((key) => key + 1)
                setAddOpen(true)
              }}
            >
              <ListPlusIcon />
              Adicionar do catálogo
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setFormKey((key) => key + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setFormKey((key) => key + 1)
              setDeleteOpen(true)
            }}
          >
            <Trash2Icon />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {stock.units.length > 0 && (
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent>
            <AddStockItemForm
              key={formKey}
              workspaceId={workspaceId}
              targets={[{ kind: "stock", id: stock.id, name: stock.name, products: catalog, payers }]}
              onDone={() => setAddOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <StockForm
            key={formKey}
            title="Editar estoque"
            description="Altere o nome e as unidades deste estoque. Quem sai volta para o próprio estoque, vazio."
            submitLabel={["Salvar", "Salvando..."]}
            stock={stock}
            units={units}
            canLinkWallet={canLinkWallet}
            action={(prev, formData) => updateStockAction(workspaceId, stock.id, prev, formData)}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <DeleteStockForm key={formKey} workspaceId={workspaceId} stock={stock} onDone={() => setDeleteOpen(false)} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Desfaz o estoque compartilhado: tudo dele vai para a unidade escolhida.
function DeleteStockForm({
  workspaceId,
  stock,
  onDone,
}: {
  workspaceId: string
  stock: StockFormValue
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: StockActionState, formData: FormData) => {
      const next = await deleteStockAction(workspaceId, stock.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const [unitId, setUnitId] = useState<string | null>(stock.units[0]?.id ?? null)
  const items = stock.units.map((unit) => ({ value: unit.id, label: unit.name }))

  return (
    <form action={formAction} className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir estoque?</AlertDialogTitle>
        <AlertDialogDescription>
          O estoque <strong>{stock.name}</strong> será excluído. Os produtos e as quantidades dele vão para a unidade
          escolhida; as outras voltam para o próprio estoque, vazio.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {state.error && <FieldError>{state.error}</FieldError>}
      <Field>
        <FieldLabel htmlFor={`delete-stock-${stock.id}-unit`}>Fica com o estoque</FieldLabel>
        <Select
          name="unitId"
          items={items}
          value={unitId}
          onValueChange={(value) => setUnitId(value as string | null)}
          required
        >
          <SelectTrigger id={`delete-stock-${stock.id}-unit`} className="w-full">
            <SelectValue placeholder="Escolha a unidade" />
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
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <Button type="submit" variant="destructive" loading={pending}>
          {pending ? "Excluindo..." : "Excluir"}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}
