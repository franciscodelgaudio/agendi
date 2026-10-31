import { notFound, redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import {
  INVENTORY_PRODUCT_PAGE_SIZE,
  inventoryProductsPipeline,
  parseInventoryProductsQuery,
  type InventoryProductsPage,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/inventory-products"
import { loadInventoryScreen } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/inventory-screen-store"
import { currencyFormat } from "@/components/shared/service-format"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { SortableHead } from "@/components/shared/sortable-head"
import { InventoryHeader } from "@/components/workspace/[workspaceId]/stock/inventory-header"
import { MovementSheet, TransferSheet } from "@/components/workspace/[workspaceId]/stock/movement-sheets"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Inventory } from "@/models/Inventory"

export default async function InventoryPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/stock/[inventoryId]">) {
  const { workspaceId, inventoryId } = await params
  const query = parseInventoryProductsQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "stock" })
  const screen = await loadInventoryScreen(workspaceId, inventoryId)
  if (!screen) notFound()

  const [result = { rows: [], total: 0 }] = await Inventory.aggregate<InventoryProductsPage>(
    inventoryProductsPipeline(inventoryId, query),
  )
  const pathname = `/workspace/${workspaceId}/stock/${inventoryId}`
  const listQuery = { q: query.q, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / INVENTORY_PRODUCT_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <>
      <InventoryHeader workspaceId={workspaceId} inventory={screen.inventory}>
        {can(actor, "stock.transfer") && screen.inventories.length > 0 && (
          <TransferSheet
            workspaceId={workspaceId}
            inventoryId={inventoryId}
            products={screen.products}
            inventories={screen.inventories}
          />
        )}
        {can(actor, "stock.manage") && (
          <MovementSheet workspaceId={workspaceId} inventoryId={inventoryId} products={screen.products} />
        )}
      </InventoryHeader>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar produto..." />
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Produto" query={listQuery} pathname={pathname} className="w-full" />
              <TableHead className="px-4 text-right @max-md:hidden">Preço</TableHead>
              <SortableHead field="quantity" label="Quantidade" query={listQuery} pathname={pathname} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum produto neste inventário.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="max-w-0 truncate px-4 font-medium">{product.name}</TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-md:hidden">
                  {currencyFormat.format(product.priceCents / 100)}
                </TableCell>
                <TableCell className="px-4 text-right font-medium tabular-nums">{product.quantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={INVENTORY_PRODUCT_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="produtos"
      />
    </>
  )
}
