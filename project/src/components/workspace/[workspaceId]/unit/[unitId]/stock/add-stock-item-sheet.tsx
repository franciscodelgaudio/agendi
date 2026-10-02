"use client"

import { useActionState, useState } from "react"
import { ListPlusIcon } from "lucide-react"
import { addSharedStockItemAction, addStockItemAction, type ProductActionState } from "@/lib/actions/product"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PayerField, type PayerOption } from "@/components/workspace/[workspaceId]/shared/stock/payer-field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// Estoque onde o produto entra: o compartilhado (kind "stock", id do estoque) ou o próprio de uma
// unidade (kind "unit", id da unidade). products: os do catálogo que ainda não estão nele;
// payers: quem pode pagar a compra.
export type StockTarget = {
  kind: "stock" | "unit"
  id: string
  name: string
  products: { id: string; name: string }[]
  payers: PayerOption[]
}

type Props = { workspaceId: string; targets: StockTarget[] }

// Põe num estoque um produto que já está no catálogo (cadastrado por outra unidade). Com mais de
// um estoque, escolhe-se o estoque no formulário.
export function AddStockItemSheet({ workspaceId, targets }: Props) {
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
      <SheetTrigger render={<Button variant="outline" />}>
        <ListPlusIcon />
        Adicionar do catálogo
      </SheetTrigger>
      <SheetContent>
        <AddStockItemForm key={formKey} workspaceId={workspaceId} targets={targets} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export function AddStockItemForm({ workspaceId, targets, onDone }: Props & { onDone: () => void }) {
  const [targetKey, setTargetKey] = useState<string | null>(targets[0] ? keyOf(targets[0]) : null)
  const target = targets.find((item) => keyOf(item) === targetKey) ?? null
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      if (!target) return { error: "Escolha o estoque." }
      const next =
        target.kind === "stock"
          ? await addSharedStockItemAction(workspaceId, target.id, prev, formData)
          : await addStockItemAction(workspaceId, target.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const targetItems = targets.map((item) => ({ value: keyOf(item), label: item.name }))

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Adicionar do catálogo</SheetTitle>
        <SheetDescription>
          Escolha um produto já cadastrado e informe quanto o estoque tem dele. A quantidade entra pelo preço da última
          compra; se o preço mudou, adicione com zero e registre a compra.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {targets.length > 1 && (
          <Field>
            <FieldLabel htmlFor="add-stock-item-target">Estoque</FieldLabel>
            <Select
              items={targetItems}
              value={targetKey}
              onValueChange={(value) => setTargetKey(value as string | null)}
              required
            >
              <SelectTrigger id="add-stock-item-target" className="w-full">
                <SelectValue placeholder="Escolha o estoque" />
              </SelectTrigger>
              <SelectContent>
                {targetItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {/* Produtos e pagadores mudam com o estoque: remonta para não sobrar a escolha de outro. */}
        <TargetFields key={targetKey ?? ""} target={target} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Adicionando..." : "Adicionar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function keyOf(target: StockTarget) {
  return `${target.kind}:${target.id}`
}

function TargetFields({ target }: { target: StockTarget | null }) {
  const [productId, setProductId] = useState<string | null>(null)
  const items = (target?.products ?? []).map((product) => ({ value: product.id, label: product.name }))

  return (
    <>
      <Field>
        <FieldLabel htmlFor="add-stock-item-product">Produto</FieldLabel>
        <Select
          name="productId"
          items={items}
          value={productId}
          onValueChange={(value) => setProductId(value as string | null)}
          required
        >
          <SelectTrigger id="add-stock-item-product" className="w-full">
            <SelectValue placeholder={items.length > 0 ? "Escolha o produto" : "Todos os produtos já estão neste estoque"} />
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
      <Field>
        <FieldLabel htmlFor="add-stock-item-quantity">Quantidade</FieldLabel>
        <Input
          id="add-stock-item-quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={0}
          max={1_000_000}
          step={1}
          placeholder="10"
          required
        />
      </Field>
      <PayerField id="add-stock-item-payer" payers={target?.payers ?? []} />
    </>
  )
}
