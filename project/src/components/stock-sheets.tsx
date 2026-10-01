"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, PlusIcon, SplitIcon, Trash2Icon, MergeIcon } from "lucide-react"
import {
  createStockAction,
  deleteStockAction,
  distributeStockAction,
  shareStockAction,
  updateStockAction,
  type StockActionState,
} from "@/lib/actions/stock"

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type StockFormValue = {
  id: string
  name: string
  distributed: boolean
  units: { id: string; name: string }[]
  products: { id: string; name: string; quantity: number }[]
}

// Unidades do workspace; stockId/stockName dizem em qual estoque cada uma já está.
export type StockUnitOption = { id: string; name: string; stockId: string | null; stockName: string | null }

type Props = { workspaceId: string; units: StockUnitOption[] }

function StockForm({
  title,
  description,
  submitLabel,
  stock,
  units,
  action,
  onDone,
}: {
  title: string
  description: string
  submitLabel: [string, string]
  stock?: StockFormValue
  units: StockUnitOption[]
  action: (prev: StockActionState, formData: FormData) => Promise<StockActionState>
  onDone: () => void
}) {
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
            As unidades marcadas usam os produtos deste estoque. Uma unidade que já está em outro estoque sai de lá.
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
                    defaultChecked={stock?.units.some((stockUnit) => stockUnit.id === unit.id)}
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
        {/* O modo só se escolhe ao criar; depois, a troca redistribui as quantidades. */}
        {!stock && (
          <Field orientation="horizontal">
            <Checkbox id={`${idPrefix}-distributed`} name="distributed" />
            <div className="grid gap-1">
              <FieldLabel htmlFor={`${idPrefix}-distributed`} className="font-normal">
                Dividir o estoque entre as unidades
              </FieldLabel>
              <FieldDescription>
                Cada unidade tem a sua quantidade de cada produto e os produtos são transferidos entre elas. Sem
                dividir, a quantidade é uma só para todas.
              </FieldDescription>
            </div>
          </Field>
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

export function CreateStockSheet({ workspaceId, units }: Props) {
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
          description="Estoque usado por várias unidades: compartilhado, com uma quantidade só, ou dividido entre elas."
          submitLabel={["Criar", "Criando..."]}
          units={units}
          action={(prev, formData) => createStockAction(workspaceId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

// Troca do compartilhado para o dividido: quanto de cada produto está em cada unidade; o resto
// fica com a unidade padrão.
function DistributeStockForm({
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
      const next = await distributeStockAction(workspaceId, stock.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )
  const [defaultUnitId, setDefaultUnitId] = useState<string | null>(stock.units[0]?.id ?? null)
  const items = stock.units.map((unit) => ({ value: unit.id, label: unit.name }))

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Dividir entre as unidades</SheetTitle>
        <SheetDescription>
          Informe quanto de cada produto está em cada unidade. O que não for informado fica com a unidade padrão.
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`distribute-${stock.id}-default`}>Unidade padrão</FieldLabel>
          <Select
            name="defaultUnitId"
            items={items}
            value={defaultUnitId}
            onValueChange={(value) => setDefaultUnitId(value as string | null)}
            required
          >
            <SelectTrigger id={`distribute-${stock.id}-default`} className="w-full">
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
        {stock.products.length === 0 ? (
          <FieldDescription>O estoque ainda não tem produtos; cada unidade começa com zero.</FieldDescription>
        ) : (
          <div className="overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Produto</TableHead>
                  {stock.units.map((unit) => (
                    <TableHead key={unit.id} className="px-3">
                      {unit.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="px-3">
                      <div className="grid">
                        <span className="truncate font-medium">{product.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{product.quantity} no total</span>
                      </div>
                    </TableCell>
                    {stock.units.map((unit) => (
                      <TableCell key={unit.id} className="px-3">
                        <Input
                          name={`quantity-${product.id}-${unit.id}`}
                          aria-label={`${product.name} em ${unit.name}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={product.quantity}
                          step={1}
                          placeholder={unit.id === defaultUnitId ? "resto" : "0"}
                          className="w-20"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Dividindo..." : "Dividir"}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function StockActions({ workspaceId, units, stock }: Props & { stock: StockFormValue }) {
  const [editOpen, setEditOpen] = useState(false)
  const [distributeOpen, setDistributeOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<StockActionState>, close: () => void) {
    startTransition(async () => {
      const result = await action()
      setError(result.error)
      if (!result.error) close()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${stock.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              setFormKey((key) => key + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          {stock.distributed ? (
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <MergeIcon />
              Juntar as quantidades
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => {
                setFormKey((key) => key + 1)
                setDistributeOpen(true)
              }}
            >
              <SplitIcon />
              Dividir entre as unidades
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <StockForm
            key={formKey}
            title="Editar estoque"
            description="Altere o nome e as unidades deste estoque."
            submitLabel={["Salvar", "Salvando..."]}
            stock={stock}
            units={units}
            action={(prev, formData) => updateStockAction(workspaceId, stock.id, prev, formData)}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={distributeOpen} onOpenChange={setDistributeOpen}>
        <SheetContent className="sm:max-w-2xl">
          <DistributeStockForm
            key={formKey}
            workspaceId={workspaceId}
            stock={stock}
            onDone={() => setDistributeOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={shareOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setShareOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Juntar as quantidades?</AlertDialogTitle>
            <AlertDialogDescription>
              O estoque <strong>{stock.name}</strong> passa a ter uma quantidade só de cada produto, a soma das
              unidades. Não dá mais para saber quanto está em cada uma nem transferir entre elas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              onClick={() => run(() => shareStockAction(workspaceId, stock.id), () => setShareOpen(false))}
              loading={pending}
            >
              {pending ? "Juntando..." : "Juntar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next) setError(null)
          setDeleteOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              O estoque <strong>{stock.name}</strong> será excluído e cada unidade volta a ter o próprio estoque. Só
              dá para excluir um estoque sem produtos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => run(() => deleteStockAction(workspaceId, stock.id), () => setDeleteOpen(false))}
              loading={pending}
            >
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
