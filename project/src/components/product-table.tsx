import {
  BanknoteIcon,
  CoinsIcon,
  HashIcon,
  PackageIcon,
  RepeatIcon,
  SettingsIcon,
  StarIcon,
  TimerResetIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import type { ReactNode } from "react"
import Link from "@/components/link"
import { CodeCell, CodeHead } from "@/components/record-code"
import { SortableHead } from "@/components/sortable-head"
import { StarRating } from "@/components/star-rating"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ProductListQuery } from "@/lib/product-list"
import type { ProductUsageSummary } from "@/lib/product-usage"
import { currencyFormat } from "@/components/service-format"
import { formatAverage } from "@/components/product-format"

type ProductRow = {
  id: string
  // Histórico de uso do produto; sem ele, o nome não é link.
  href?: string
  // Aparece abaixo do nome, antes das observações.
  origin?: string | null
  name: string
  quantity: number
  // Preço da última compra (catálogo).
  costCents: number
  // Soma dos lotes (quantidade × preço pago).
  valueCents: number
  // Preço do lote mais antigo, o próximo a sair; null sem lotes ou com vários estoques.
  nextUnitCostCents: number | null
  notes: string | null
  rating: number | null
  avatarUrl: string | null
  usage: ProductUsageSummary
}

type Props<T extends ProductRow> = {
  products: T[]
  query: ProductListQuery
  pathname: string
  // next: custo do próximo a sair (estoque de uma unidade); last: preço da última compra (catálogo).
  cost: "next" | "last"
  // Ações de cada produto; sem elas (sem permissão), a coluna não aparece.
  actions?: (product: T) => ReactNode
}

function money(cents: number | null) {
  return cents === null ? "—" : currencyFormat.format(cents / 100)
}

export function ProductTable<T extends ProductRow>({ products, query, pathname, cost, actions }: Props<T>) {
  const canManage = actions !== undefined
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-5xl:hidden" />
            <SortableHead field="name" label="Produto" icon={PackageIcon} query={query} pathname={pathname} className="w-full" />
            <SortableHead field="quantity" label="Quantidade" icon={HashIcon} query={query} pathname={pathname} />
            {cost === "last" ? (
              <SortableHead
                field="costCents"
                label="Última compra"
                icon={BanknoteIcon}
                query={query}
                pathname={pathname}
                className="@max-xl:hidden"
              />
            ) : (
              <UsageHead
                icon={BanknoteIcon}
                label="Próximo a sair"
                title="Preço pago no lote mais antigo, que sai primeiro (PEPS)"
                className="@max-xl:hidden"
              />
            )}
            <UsageHead
              icon={CoinsIcon}
              label="Valor em estoque"
              title="Soma do que foi pago pelas unidades que ainda estão em estoque"
              className="@max-xl:hidden"
            />
            <SortableHead
              field="rating"
              label="Avaliação"
              icon={StarIcon}
              query={query}
              pathname={pathname}
              className="@max-3xl:hidden"
            />
            <UsageHead
              icon={RepeatIcon}
              label="Usos"
              title="Atendimentos e agendamentos desde a última vez que o produto acabou"
              className="@max-2xl:hidden"
            />
            <UsageHead
              icon={TimerResetIcon}
              label="Média até acabar"
              title="Média de usos entre uma vez que o produto acabou e a seguinte"
              className="@max-4xl:hidden"
            />
            {canManage && (
              <TableHead className="w-0 px-4 text-right">
                <span className="inline-flex items-center gap-1">
                  <SettingsIcon className="size-4 text-muted-foreground" />
                  Ações
                </span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 9 : 8} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum produto encontrado.
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => {
              const details = [product.origin, product.notes].filter(Boolean).join(" · ")
              return (
                <TableRow key={product.id}>
                  <CodeCell id={product.id} className="@max-5xl:hidden" />
                  <TableCell className="max-w-0 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="rounded-md after:rounded-md">
                        {product.avatarUrl && (
                          <AvatarImage src={product.avatarUrl} alt={product.name} className="rounded-md object-contain" />
                        )}
                        <InitialFallback name={product.name} className="rounded-md" />
                      </Avatar>
                      <div className="grid min-w-0">
                        {product.href ? (
                          <Link href={product.href} className="truncate font-medium hover:underline">
                            {product.name}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{product.name}</span>
                        )}
                        {details && (
                          <span className="truncate text-xs text-muted-foreground" title={details}>
                            {details}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 tabular-nums">{product.quantity}</TableCell>
                  <TableCell className="px-4 tabular-nums @max-xl:hidden">
                    {money(cost === "last" ? product.costCents : product.nextUnitCostCents)}
                  </TableCell>
                  <TableCell className="px-4 tabular-nums @max-xl:hidden">{money(product.valueCents)}</TableCell>
                  <TableCell className="px-4 @max-3xl:hidden">
                    <StarRating value={product.rating} />
                  </TableCell>
                  <TableCell className="px-4 tabular-nums @max-2xl:hidden">{product.usage.usesSinceLastDepletion}</TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums @max-4xl:hidden">
                    {formatAverage(product.usage.averageUsesPerDepletion)}
                  </TableCell>
                  {actions && <TableCell className="px-4 text-right">{actions(product)}</TableCell>}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function UsageHead({
  icon: Icon,
  label,
  title,
  className,
}: {
  icon: LucideIcon
  label: string
  title: string
  className?: string
}) {
  return (
    <TableHead className={cn("px-4", className)} title={title}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}
