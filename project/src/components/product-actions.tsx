"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "@/components/link"
import { ArrowRightLeftIcon, EllipsisIcon, HistoryIcon, PackageXIcon, PencilIcon, Trash2Icon } from "lucide-react"
import {
  deleteProductAction,
  depleteProductAction,
  transferProductAction,
  updateProductAction,
  type ProductActionState,
} from "@/lib/actions/product"
import type { ProductUsageSummary } from "@/lib/product-usage"

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProductFields } from "@/components/product-fields"
import { formatUses } from "@/components/product-format"
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
  quantity: number
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
  // Só no estoque distribuído: a parte de cada unidade.
  unitQuantities?: { unitId: string; quantity: number }[]
  usage: ProductUsageSummary
}

type Props = { workspaceId: string; unitId: string; product: Product }

type TransferUnit = { id: string; name: string }

export function ProductActions({
  workspaceId,
  unitId,
  product,
  transferUnits = null,
}: Props & { transferUnits?: TransferUnit[] | null }) {
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferKey, setTransferKey] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [depleteOpen, setDepleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${product.name}`} />}
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDepleteOpen(true)}>
            <PackageXIcon />
            Marcar como acabou
          </DropdownMenuItem>
          {transferUnits && (
            <DropdownMenuItem
              onClick={() => {
                setTransferKey((k) => k + 1)
                setTransferOpen(true)
              }}
            >
              <ArrowRightLeftIcon />
              Transferir
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href={`/workspace/${workspaceId}/unit/${unitId}/stock/${product.id}`} />}>
            <HistoryIcon />
            Histórico de uso
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
          <EditProductForm
            key={editKey}
            workspaceId={workspaceId}
            unitId={unitId}
            product={product}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {transferUnits && (
        <Sheet open={transferOpen} onOpenChange={setTransferOpen}>
          <SheetContent>
            <TransferProductForm
              key={transferKey}
              workspaceId={workspaceId}
              unitId={unitId}
              product={product}
              units={transferUnits}
              onDone={() => setTransferOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      <DeleteProductDialog
        workspaceId={workspaceId}
        unitId={unitId}
        product={product}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />

      <DepleteProductDialog
        workspaceId={workspaceId}
        unitId={unitId}
        product={product}
        open={depleteOpen}
        onOpenChange={setDepleteOpen}
      />
    </>
  )
}

function EditProductForm({ workspaceId, unitId, product, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await updateProductAction(workspaceId, unitId, product.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar produto</SheetTitle>
        <SheetDescription>Altere os dados deste produto.</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ProductFields
          idPrefix={`edit-product-${product.id}`}
          workspaceId={workspaceId}
          unitId={unitId}
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

function DeleteProductDialog({
  workspaceId,
  unitId,
  product,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProductAction(workspaceId, unitId, product.id)
      setError(result.error)
      if (!result.error) onOpenChange(false)
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
          <AlertDialogDescription>
            O produto <strong>{product.name}</strong> será excluído permanentemente. Essa ação não pode ser desfeita.
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
  )
}

function DepleteProductDialog({
  workspaceId,
  unitId,
  product,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDeplete() {
    startTransition(async () => {
      const result = await depleteProductAction(workspaceId, unitId, product.id)
      setError(result.error)
      if (!result.error) onOpenChange(false)
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar como acabou?</AlertDialogTitle>
          <AlertDialogDescription>
            Registra que uma unidade de <strong>{product.name}</strong> acabou agora, depois de{" "}
            {formatUses(product.usage.usesSinceLastDepletion)}, e tira 1 da quantidade em estoque (hoje{" "}
            {product.quantity}).
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button onClick={handleDeplete} loading={pending}>
            {pending ? "Registrando..." : "Acabou"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Leva produto de uma unidade do estoque distribuído para outra; começa saindo desta unidade.
function TransferProductForm({
  workspaceId,
  unitId,
  product,
  units,
  onDone,
}: Props & { units: TransferUnit[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await transferProductAction(workspaceId, unitId, product.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const [fromUnitId, setFromUnitId] = useState<string | null>(unitId)
  const [toUnitId, setToUnitId] = useState<string | null>(() => units.find((unit) => unit.id !== unitId)?.id ?? null)
  const quantityOf = (id: string | null) => product.unitQuantities?.find((unit) => unit.unitId === id)?.quantity ?? 0
  const items = units.map((unit) => ({ value: unit.id, label: `${unit.name} (${quantityOf(unit.id)})` }))
  const idPrefix = `transfer-product-${product.id}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Transferir produto</SheetTitle>
        <SheetDescription>
          Leve <strong>{product.name}</strong> de uma unidade para outra. O total do estoque não muda.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-from`}>De</FieldLabel>
          <Select name="fromUnitId" items={items} value={fromUnitId} onValueChange={(value) => setFromUnitId(value as string | null)} required>
            <SelectTrigger id={`${idPrefix}-from`} className="w-full">
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
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-to`}>Para</FieldLabel>
          <Select name="toUnitId" items={items} value={toUnitId} onValueChange={(value) => setToUnitId(value as string | null)} required>
            <SelectTrigger id={`${idPrefix}-to`} className="w-full">
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
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-quantity`}>Quantidade</FieldLabel>
          <Input
            id={`${idPrefix}-quantity`}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={quantityOf(fromUnitId) || undefined}
            step={1}
            placeholder="1"
            required
          />
          <FieldDescription>Disponível na origem: {quantityOf(fromUnitId)}.</FieldDescription>
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Transferindo..." : "Transferir"}
        </Button>
      </SheetFooter>
    </form>
  )
}
