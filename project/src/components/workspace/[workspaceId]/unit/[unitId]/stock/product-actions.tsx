"use client"

import { useActionState, useState, useTransition } from "react"
import { PayerField, type PayerOption } from "@/components/workspace/[workspaceId]/shared/stock/payer-field"
import Link from "@/components/shared/link"
import {
  ArrowRightLeftIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  HistoryIcon,
  PackageXIcon,
  PencilIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from "lucide-react"
import {
  deleteProductAction,
  adjustStockAction,
  depleteProductAction,
  registerPurchaseAction,
  transferProductAction,
  updateProductAction,
  type ProductActionState,
} from "@/lib/actions/product"
import type { ProductUsageSummary } from "@/service/workspace/[workspaceId]/stock/products/product-usage"

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
import { AmountInput } from "@/components/shared/amount-input"
import { ProductFields } from "@/components/workspace/[workspaceId]/shared/stock/product-fields"
import { formatUses } from "@/components/workspace/[workspaceId]/shared/stock/product-format"
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
  usage: ProductUsageSummary
}

type Props = { workspaceId: string; unitId: string; product: Product }

// Unidades do workspace e quanto do produto o estoque de cada uma tem.
export type ProductTransfer = { units: { id: string; name: string }[]; quantities: Record<string, number> }

// payers: quem pode pagar uma compra (unidades do estoque compartilhado e a carteira dele).
export function ProductActions({
  workspaceId,
  unitId,
  product,
  transfer = null,
  payers = [],
}: Props & { transfer?: ProductTransfer | null; payers?: PayerOption[] }) {
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferKey, setTransferKey] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [depleteOpen, setDepleteOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
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
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setPurchaseOpen(true)
            }}
          >
            <ShoppingCartIcon />
            Registrar compra
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setAdjustOpen(true)
            }}
          >
            <ClipboardCheckIcon />
            Ajustar estoque
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDepleteOpen(true)}>
            <PackageXIcon />
            Marcar como acabou
          </DropdownMenuItem>
          {transfer && (
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
            Tirar do estoque
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

      <Sheet open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <SheetContent>
          <PurchaseForm
            key={editKey}
            workspaceId={workspaceId}
            unitId={unitId}
            product={product}
            payers={payers}
            onDone={() => setPurchaseOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={adjustOpen} onOpenChange={setAdjustOpen}>
        <SheetContent>
          <AdjustForm
            key={editKey}
            workspaceId={workspaceId}
            unitId={unitId}
            product={product}
            onDone={() => setAdjustOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {transfer && (
        <Sheet open={transferOpen} onOpenChange={setTransferOpen}>
          <SheetContent>
            <TransferProductForm
              key={transferKey}
              workspaceId={workspaceId}
              unitId={unitId}
              product={product}
              transfer={transfer}
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
        <SheetDescription>
          Altere os dados do produto; valem para o estoque de todas as unidades. A quantidade muda por compra ou ajuste.
        </SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <ProductFields
          idPrefix={`edit-product-${product.id}`}
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
          <AlertDialogTitle>Tirar do estoque?</AlertDialogTitle>
          <AlertDialogDescription>
            O produto <strong>{product.name}</strong> sai do estoque desta unidade, com a quantidade dele. Ele continua no
            catálogo e nos estoques das outras unidades.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} loading={pending}>
            {pending ? "Tirando..." : "Tirar"}
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

// Leva produto do estoque de uma unidade para o de outra; começa saindo desta unidade.
function TransferProductForm({
  workspaceId,
  unitId,
  product,
  transfer: { units, quantities },
  onDone,
}: Props & { transfer: ProductTransfer; onDone: () => void }) {
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
  const quantityOf = (id: string | null) => (id && quantities[id]) || 0
  const items = units.map((unit) => ({ value: unit.id, label: `${unit.name} (${quantityOf(unit.id)})` }))
  const idPrefix = `transfer-product-${product.id}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Transferir produto</SheetTitle>
        <SheetDescription>
          Leve <strong>{product.name}</strong> do estoque de uma unidade para o de outra.
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

// Compra de mais unidades: vira um lote com o preço pago, que sai depois dos que já estão aqui.
function PurchaseForm({
  workspaceId,
  unitId,
  product,
  payers,
  onDone,
}: Props & { payers: PayerOption[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await registerPurchaseAction(workspaceId, unitId, product.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = `purchase-product-${product.id}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Registrar compra</SheetTitle>
        <SheetDescription>
          A compra de <strong>{product.name}</strong> vira um lote com o preço pago e uma despesa no caixa de quem paga.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-quantity`}>Quantidade comprada</FieldLabel>
          <Input
            id={`${idPrefix}-quantity`}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={1_000_000}
            step={1}
            placeholder="10"
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-cost`}>Preço pago por unidade</FieldLabel>
          <AmountInput
            id={`${idPrefix}-cost`}
            name="cost"
            max={100_000_000}
            placeholder="R$ 45,90"
            defaultValue={product.costCents}
            required
          />
          <FieldDescription>Vem preenchido com o preço da última compra.</FieldDescription>
        </Field>
        <PayerField id={`${idPrefix}-payer`} payers={payers} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Registrando..." : "Registrar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

// Ajuste pela contagem (perda, quebra, uso sem registro): o que falta sai dos lotes mais antigos.
function AdjustForm({ workspaceId, unitId, product, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProductActionState, formData: FormData) => {
      const next = await adjustStockAction(workspaceId, unitId, product.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const idPrefix = `adjust-product-${product.id}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Ajustar estoque</SheetTitle>
        <SheetDescription>
          Informe quanto de <strong>{product.name}</strong> há de fato. O que faltar sai dos lotes mais antigos, sem
          despesa no caixa.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-quantity`}>Quantidade contada</FieldLabel>
          <Input
            id={`${idPrefix}-quantity`}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={0}
            max={product.quantity}
            step={1}
            defaultValue={product.quantity}
            autoFocus
            required
          />
          <FieldDescription>Hoje no sistema: {product.quantity}. Para pôr mais, registre uma compra.</FieldDescription>
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Ajustando..." : "Ajustar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
