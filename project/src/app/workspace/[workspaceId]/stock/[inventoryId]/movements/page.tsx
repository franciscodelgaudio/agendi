import { notFound, redirect } from "next/navigation"
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import {
  MOVEMENT_PAGE_SIZE,
  movementListPipeline,
  parseMovementListQuery,
  type MovementListPage,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/movement-list"
import { loadInventoryScreen } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/inventory-screen-store"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { QuerySelect } from "@/components/shared/query-select"
import { InventoryHeader } from "@/components/workspace/[workspaceId]/stock/inventory-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StockMovement } from "@/models/StockMovement"
import { cn } from "@/service/_shared/utils"

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
})

export default async function InventoryMovementsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/stock/[inventoryId]/movements">) {
  const { workspaceId, inventoryId } = await params
  const query = parseMovementListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "stock" })
  const screen = await loadInventoryScreen(workspaceId, inventoryId)
  if (!screen) notFound()

  const [result] = await StockMovement.aggregate<MovementListPage>(movementListPipeline(inventoryId, query))
  const pathname = `/workspace/${workspaceId}/stock/${inventoryId}/movements`
  const listQuery = { q: query.q, type: query.type }
  const pages = Math.ceil(result.total / MOVEMENT_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <>
      <InventoryHeader workspaceId={workspaceId} inventory={screen.inventory} />
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar movimento..." />
        <QuerySelect
          query={listQuery}
          field="type"
          label="Tipo"
          items={[
            { value: "all", label: "Entradas e saídas" },
            { value: "in", label: "Entradas" },
            { value: "out", label: "Saídas" },
          ]}
        />
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full px-4">Movimento</TableHead>
              <TableHead className="px-4 @max-xl:hidden">Produto</TableHead>
              <TableHead className="px-4 @max-md:hidden">Quando</TableHead>
              <TableHead className="px-4 text-right">Quantidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum movimento encontrado.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((movement) => {
              const incoming = movement.type === "in"
              const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon
              return (
                <TableRow key={movement.id}>
                  <TableCell className="max-w-0 px-4 font-medium">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("size-4 shrink-0", incoming ? "text-emerald-600" : "text-muted-foreground")} />
                      <span className="truncate">{movement.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 @max-xl:hidden">{movement.productName ?? "Produto excluído"}</TableCell>
                  <TableCell className="px-4 tabular-nums @max-md:hidden">{dateFormat.format(movement.createdAt)}</TableCell>
                  <TableCell className="px-4 text-right font-medium tabular-nums">
                    {incoming ? "+" : "−"}
                    {movement.quantity}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={MOVEMENT_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="movimentos"
      />
    </>
  )
}
