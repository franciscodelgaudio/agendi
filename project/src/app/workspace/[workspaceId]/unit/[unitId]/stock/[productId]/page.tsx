import Link from "@/components/link"
import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { ArrowLeftIcon } from "lucide-react"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { addLots } from "@/lib/stock-lots"
import { findUnitHolder, toLots } from "@/lib/stock-store"
import {
  PRODUCT_HISTORY_PAGE_SIZE,
  parseProductHistoryQuery,
  productHistoryPipeline,
  type ProductHistoryPage,
} from "@/lib/product-history"
import { Appointment } from "@/models/Appointment"
import { StockItem } from "@/models/StockItem"
import { Workspace } from "@/models/Workspace"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { PeriodFilter } from "@/components/period-filter"
import { formatAverage, formatUses } from "@/components/product-format"
import { ProductHistoryKindFilter } from "@/components/product-history-kind-filter"
import { ProductHistoryTable } from "@/components/product-history-table"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import { Button } from "@/components/ui/button"
import { currencyFormat } from "@/components/service-format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Dia da compra no fuso de Brasília.
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" })

type ProductHeader = { name: string; quantity: number; valueCents: number; avatarUrl: string | null }

// Histórico de uso de um produto no estoque da unidade: atendimentos e agendamentos das
// unidades que usam esse estoque e cada vez que ele acabou nele.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ProductHistoryPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/stock/[productId]">) {
  const { workspaceId, unitId, productId } = await params
  const query = parseProductHistoryQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "stock", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId) || !isObjectIdOrHexString(productId)) notFound()
  const holder = await findUnitHolder(unitId)

  // Parte do workspace -> unidade -> produto para que o acesso seja garantido em cada nível.
  const [workspace] = await Workspace.aggregate<{ product: ProductHeader | null }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: new Types.ObjectId(unitId) } }, { $project: { _id: 1 } }],
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "workspaceId",
        as: "product",
        pipeline: [
          { $match: { _id: new Types.ObjectId(productId) } },
          ...productListPipeline({ q: "", sort: "name", dir: "asc" }, holder.holderId),
        ],
      },
    },
    // Sem a unidade no workspace, o produto não aparece.
    {
      $project: {
        _id: 0,
        product: { $cond: [{ $gt: [{ $size: "$unit" }, 0] }, { $ifNull: [{ $first: "$product" }, null] }, null] },
      },
    },
  ])
  const product = workspace?.product
  if (!product) notFound()

  const [[history], usageOf, item] = await Promise.all([
    Appointment.aggregate<ProductHistoryPage>(productHistoryPipeline(productId, holder, query)),
    findProductUsage({ holderIds: [holder.holderId], unitIds: holder.unitIds }, productId),
    StockItem.findOne({ holderId: holder.holderId, productId }).select({ lots: 1 }).lean(),
  ])
  // Lotes em estoque, do que sai primeiro (PEPS) para o mais recente.
  const lots = addLots([], toLots(item?.lots ?? []))
  const usage = usageOf(productId)
  const cycleUses = Object.fromEntries(usage.cycles.map((cycle) => [cycle.depletedAt.toISOString(), cycle.uses]))

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/stock/${productId}`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = query
  // Página além da última (ex.: depois de mudar o filtro) vai para a última.
  const pages = Math.ceil(history.total / PRODUCT_HISTORY_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const next = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${next}`)
  }

  const stats = [
    { label: "Média até acabar", value: formatAverage(usage.averageUsesPerDepletion) },
    { label: "Desde a última vez que acabou", value: formatUses(usage.usesSinceLastDepletion) },
    { label: "Vezes que acabou", value: String(usage.cycles.length) },
    { label: "Quantidade em estoque", value: String(product.quantity) },
  ]
  const money = (cents: number) => currencyFormat.format(cents / 100)

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        nativeButton={false}
        render={<Link href={`/workspace/${workspaceId}/unit/${unitId}/stock`} />}
      >
        <ArrowLeftIcon />
        Estoque
      </Button>
      <div className="flex items-center gap-3">
        <Avatar className="size-10 rounded-md after:rounded-md">
          {product.avatarUrl && <AvatarImage src={product.avatarUrl} alt={product.name} className="rounded-md object-contain" />}
          <InitialFallback name={product.name} className="rounded-md" />
        </Avatar>
        <div className="grid gap-0.5">
          <h3 className="truncate text-lg font-semibold tracking-tight">{product.name}</h3>
          <p className="text-sm text-muted-foreground">Histórico de uso</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border p-3">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-semibold tracking-tight">Lotes em estoque</h4>
          <span className="text-sm text-muted-foreground">Valor em estoque: {money(product.valueCents)}</span>
        </div>
        <div className="border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Compra</TableHead>
                <TableHead className="px-4 text-right">Quantidade</TableHead>
                <TableHead className="px-4 text-right">Preço por unidade</TableHead>
                <TableHead className="px-4 text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 px-4 text-center text-muted-foreground">
                    Nenhuma unidade em estoque.
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot, i) => (
                  <TableRow key={`${lot.purchasedAt.toISOString()}-${i}`}>
                    <TableCell className="px-4">
                      {dateFormat.format(lot.purchasedAt)}
                      {i === 0 && <span className="ml-2 text-xs text-muted-foreground">sai primeiro</span>}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums">{lot.quantity}</TableCell>
                    <TableCell className="px-4 text-right tabular-nums">{money(lot.unitCostCents)}</TableCell>
                    <TableCell className="px-4 text-right tabular-nums">{money(lot.quantity * lot.unitCostCents)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Contam os atendimentos e os agendamentos que ainda não viraram atendimento, até agora. Agendamentos futuros
        aparecem na lista, mas só contam quando a data chegar.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={filters} placeholder="Buscar hóspede, quarto, serviço ou profissional..." />
        <ProductHistoryKindFilter query={filters} />
        <PeriodFilter query={filters} />
      </div>
      <ProductHistoryTable
        rows={history.rows}
        query={filters}
        pathname={pathname}
        cycleUses={cycleUses}
        now={new Date()}
      />
      <ListPagination
        query={filters}
        page={page}
        pageSize={PRODUCT_HISTORY_PAGE_SIZE}
        total={history.total}
        pathname={pathname}
        itemLabel="registros"
      />
    </div>
  )
}
