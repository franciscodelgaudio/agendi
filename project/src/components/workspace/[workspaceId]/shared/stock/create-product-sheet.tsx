"use client"

import { useActionState, useState } from "react"
import { PlusIcon } from "lucide-react"
import { createCatalogProductAction, createProductAction, type ProductActionState } from "@/lib/actions/product"

import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { ProductFields } from "@/components/workspace/[workspaceId]/shared/stock/product-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// Com unitId, cadastra no catálogo e já põe no estoque da unidade, com a quantidade; sem, só no
// catálogo do workspace.
export function CreateProductSheet({ workspaceId, unitId }: { workspaceId: string; unitId?: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = unitId
        ? await createProductAction(workspaceId, unitId, prev, formData)
        : await createCatalogProductAction(workspaceId, prev, formData)
      if (!next.error) setOpen(false)
      return next
    },
    { error: null },
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Cadastrar produto
      </SheetTrigger>
      <SheetContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Cadastrar produto</SheetTitle>
            <SheetDescription>
              {unitId
                ? "Cadastre o produto no catálogo e informe quanto esta unidade tem dele."
                : "Cadastre o produto no catálogo; a quantidade é informada no estoque de cada unidade."}
            </SheetDescription>
          </SheetHeader>
          {/* Só os campos rolam; título e botões ficam fixos. */}
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
            {state.error && <FieldError>{state.error}</FieldError>}
            <ProductFields idPrefix="create-product" workspaceId={workspaceId} withQuantity={!!unitId} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={pending}>
              {pending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
