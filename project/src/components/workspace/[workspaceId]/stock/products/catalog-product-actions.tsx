"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import {
  deleteCatalogProductAction,
  updateCatalogProductAction,
  type ProductActionState,
} from "@/lib/actions/product"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { ProductFields } from "@/components/workspace/[workspaceId]/shared/stock/product-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Product = {
  id: string
  name: string
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
}

type Props = { workspaceId: string; product: Product }

// Ações do produto no catálogo do workspace: os dados dele valem para todos os estoques.
export function CatalogProductActions({ workspaceId, product }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCatalogProductAction(workspaceId, product.id)
      setError(result.error)
      if (!result.error) setDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${product.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <EditCatalogProductForm
            key={editKey}
            workspaceId={workspaceId}
            product={product}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setDeleteOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto <strong>{product.name}</strong> sai do catálogo e do estoque de todas as unidades. Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} loading={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditCatalogProductForm({ workspaceId, product, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await updateCatalogProductAction(workspaceId, product.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar produto</SheetTitle>
        <SheetDescription>Altere os dados do produto; valem para o estoque de todas as unidades.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ProductFields
          idPrefix={`edit-catalog-product-${product.id}`}
          workspaceId={workspaceId}
          withQuantity={false}
          defaultValues={product}
        />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
