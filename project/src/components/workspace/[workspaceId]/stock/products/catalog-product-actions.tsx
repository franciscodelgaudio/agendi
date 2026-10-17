"use client"

import { useActionState, useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, PencilIcon } from "lucide-react"
import {
  deactivateCatalogProductAction,
  reactivateCatalogProductAction,
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
import { toast } from "sonner"
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
  active: boolean
}

type Props = { workspaceId: string; product: Product }

// Ações do produto no catálogo do workspace: os dados dele valem para todos os estoques.
export function CatalogProductActions({ workspaceId, product }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateCatalogProductAction(workspaceId, product.id)
      setError(result.error)
      if (!result.error) setDeactivateOpen(false)
    })
  }

  // Desativado não aceita alteração: só reativar.
  if (!product.active) return <ReactivateCatalogProductButton workspaceId={workspaceId} product={product} />

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
          <DropdownMenuItem variant="destructive" onClick={() => setDeactivateOpen(true)}>
            <ArchiveIcon />
            Desativar
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
        open={deactivateOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setDeactivateOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto <strong>{product.name}</strong> sai dos estoques e da escolha de produtos nos serviços,
              agendamentos e atendimentos. Nada é apagado: o histórico de compras e de uso continua, e você pode
              reativá-lo quando quiser. Só é possível desativar sem quantidade em nenhum estoque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeactivate} loading={pending}>
              {pending ? "Desativando..." : "Desativar"}
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

function ReactivateCatalogProductButton({ workspaceId, product }: Props) {
  const [pending, startTransition] = useTransition()

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateCatalogProductAction(workspaceId, product.id)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReactivate} loading={pending}>
      <ArchiveRestoreIcon />
      {pending ? "Reativando..." : "Reativar"}
    </Button>
  )
}
