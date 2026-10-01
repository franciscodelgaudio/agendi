import {
  BanknoteIcon,
  HashIcon,
  PackageIcon,
  RepeatIcon,
  SettingsIcon,
  StarIcon,
  TimerResetIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import Link from "@/components/link"
import { ProductActions } from "@/components/product-actions"
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

type Props = {
  products: {
    id: string
    // Unidade de onde as ações e o histórico são abertos.
    unitId: string
    // Unidade ou estoque de várias unidades de onde o produto é; aparece abaixo do nome.
    origin?: string | null
    // Só no estoque distribuído: a parte de cada unidade.
    unitQuantities?: { unitId: string; quantity: number }[]
    name: string
    quantity: number
    costCents: number
    notes: string | null
    rating: number | null
    avatarUrl: string | null
    usage: ProductUsageSummary
  }[]
  query: ProductListQuery
  pathname: string
  workspaceId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
  // Unidades do estoque distribuído, para quem pode transferir; null esconde a ação.
  transferUnits?: { id: string; name: string }[] | null
}

export function ProductTable({ products, query, pathname, workspaceId, canManage, transferUnits = null }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-5xl:hidden" />
            <SortableHead field="name" label="Produto" icon={PackageIcon} query={query} pathname={pathname} className="w-full" />
            <SortableHead field="quantity" label="Quantidade" icon={HashIcon} query={query} pathname={pathname} />
            <SortableHead
              field="costCents"
              label="Preço de custo"
              icon={BanknoteIcon}
              query={query}
              pathname={pathname}
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
              <TableCell colSpan={canManage ? 8 : 7} className="h-24 px-4 text-center text-muted-foreground">
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
                        <Link
                          href={`/workspace/${workspaceId}/unit/${product.unitId}/stock/${product.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {product.name}
                        </Link>
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
                    {currencyFormat.format(product.costCents / 100)}
                  </TableCell>
                  <TableCell className="px-4 @max-3xl:hidden">
                    <StarRating value={product.rating} />
                  </TableCell>
                  <TableCell className="px-4 tabular-nums @max-2xl:hidden">{product.usage.usesSinceLastDepletion}</TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums @max-4xl:hidden">
                    {formatAverage(product.usage.averageUsesPerDepletion)}
                  </TableCell>
                  {canManage && (
                    <TableCell className="px-4 text-right">
                      <ProductActions
                        workspaceId={workspaceId}
                        unitId={product.unitId}
                        product={product}
                        transferUnits={transferUnits}
                      />
                    </TableCell>
                  )}
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
