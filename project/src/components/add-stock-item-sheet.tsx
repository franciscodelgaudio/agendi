"use client"

import { useActionState, useState } from "react"
import { ListPlusIcon } from "lucide-react"
import { addStockItemAction, type ProductActionState } from "@/lib/actions/product"

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

type Props = { workspaceId: string; unitId: string; products: { id: string; name: string }[] }

// Põe no estoque da unidade um produto que já está no catálogo (cadastrado por outra unidade).
export function AddStockItemSheet({ workspaceId, unitId, products }: Props) {
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
        <AddStockItemForm
          key={formKey}
          workspaceId={workspaceId}
          unitId={unitId}
          products={products}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

function AddStockItemForm({ workspaceId, unitId, products, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await addStockItemAction(workspaceId, unitId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const [productId, setProductId] = useState<string | null>(null)
  const items = products.map((product) => ({ value: product.id, label: product.name }))

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Adicionar do catálogo</SheetTitle>
        <SheetDescription>Escolha um produto já cadastrado e informe quanto esta unidade tem dele.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
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
              <SelectValue placeholder="Escolha o produto" />
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
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Adicionando..." : "Adicionar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
