"use client"

import { useState } from "react"
import { ArrowDownLeftIcon, ArrowUpRightIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { ProductMovementSheet } from "@/components/workspace/[workspaceId]/stock/movement-sheets"
import { DeleteProductDialog, EditProductSheet } from "@/components/workspace/[workspaceId]/stock/product-sheets"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Open = "in" | "out" | "edit" | "delete" | null

export function InventoryProductActions({
  workspaceId,
  inventoryId,
  product,
}: {
  workspaceId: string
  inventoryId: string
  product: { id: string; name: string; priceCents: number; quantity: number }
}) {
  const [open, setOpen] = useState<Open>(null)
  const sheet = (kind: Exclude<Open, null>) => ({
    open: open === kind,
    onOpenChange: (next: boolean) => setOpen(next ? kind : null),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${product.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onClick={() => setOpen("in")}>
            <ArrowDownLeftIcon />
            Entrada
          </DropdownMenuItem>
          <DropdownMenuItem disabled={product.quantity === 0} onClick={() => setOpen("out")}>
            <ArrowUpRightIcon />
            Dar baixa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <PencilIcon />
            Editar produto
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setOpen("delete")}>
            <Trash2Icon />
            Excluir produto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProductMovementSheet workspaceId={workspaceId} inventoryId={inventoryId} product={product} type="in" {...sheet("in")} />
      <ProductMovementSheet workspaceId={workspaceId} inventoryId={inventoryId} product={product} type="out" {...sheet("out")} />
      <EditProductSheet workspaceId={workspaceId} product={product} {...sheet("edit")} />
      <DeleteProductDialog workspaceId={workspaceId} product={product} {...sheet("delete")} />
    </>
  )
}
