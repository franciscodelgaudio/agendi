import { redirect } from "next/navigation"
import { BoxesIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadStockUnit } from "@/service/workspace/[workspaceId]/stock/stock-unit-store"
import {
  INVENTORY_PAGE_SIZE,
  inventoryListPipeline,
  parseInventoryListQuery,
  type InventoryListPage,
} from "@/service/workspace/[workspaceId]/stock/inventory-list"
import Link from "@/components/shared/link"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { QuerySelect } from "@/components/shared/query-select"
import { SortableHead } from "@/components/shared/sortable-head"
import { CreateInventorySheet, InventoryActions } from "@/components/workspace/[workspaceId]/stock/inventory-sheets"
import { UnitInventorySheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-ref-sheets"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Inventory } from "@/models/Inventory"

export default async function InventoriesPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params
  const query = parseInventoryListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "stock" })
  const canManage = can(actor, "stock.manage")
  const unit = await loadStockUnit(workspaceId)
  const pathname = `/workspace/${workspaceId}/stock`

  if (unit?.inventoryId) redirect(`${pathname}/${unit.inventoryId}`)

  if (unit) {
    const canLink = can(actor, "units.manage")
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxesIcon />
          </EmptyMedia>
          <EmptyTitle>{unit.name} não tem estoque</EmptyTitle>
          <EmptyDescription>
            {canLink
              ? "Crie um estoque novo ou vincule um que já existe para registrar entradas e saídas de produtos."
              : "Peça a quem gerencia as unidades para vincular um estoque."}{" "}
            Para ver todos os estoques, escolha &quot;Todas as unidades&quot; no seletor.
          </EmptyDescription>
        </EmptyHeader>
        {canLink && (
          <EmptyContent className="flex-row flex-wrap justify-center gap-2">
            <UnitInventorySheet
              workspaceId={workspaceId}
              unitId={unit.id}
              unitName={unit.name}
              options={unit.inventories}
              currentId={null}
              createOnly
            />
            {unit.inventories.length > 0 && (
              <UnitInventorySheet
                workspaceId={workspaceId}
                unitId={unit.id}
                unitName={unit.name}
                options={unit.inventories}
                currentId={null}
                standalone
              />
            )}
          </EmptyContent>
        )}
      </Empty>
    )
  }

  const [result] = await Inventory.aggregate<InventoryListPage>(inventoryListPipeline(workspaceId, query))
  const listQuery = { q: query.q, unit: query.unit, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / INVENTORY_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <>
      <ListToolbar actions={canManage && <CreateInventorySheet workspaceId={workspaceId} />}>
        <ListSearch query={listQuery} placeholder="Buscar estoque..." />
        <QuerySelect
          query={listQuery}
          field="unit"
          label="Unidade"
          items={[
            { value: "all", label: "Com e sem unidade" },
            { value: "linked", label: "Com unidade" },
            { value: "unlinked", label: "Sem unidade" },
          ]}
        />
      </ListToolbar>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Estoque" query={listQuery} pathname={pathname} className="w-full" />
              <TableHead className="px-4 @max-3xl:hidden">Unidades</TableHead>
              <SortableHead
                field="products"
                label="Produtos"
                query={listQuery}
                pathname={pathname}
                className="text-right @max-md:hidden"
              />
              <SortableHead field="quantity" label="Itens" query={listQuery} pathname={pathname} className="text-right" />
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum estoque encontrado.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((inventory) => (
              <TableRow key={inventory.id}>
                <TableCell className="max-w-0 px-4 font-medium">
                  <Link href={`${pathname}/${inventory.id}`} className="flex items-center gap-2 hover:underline">
                    <BoxesIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{inventory.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="px-4 @max-3xl:hidden">
                  <div className="flex gap-1">
                    {inventory.units.length === 0 ? (
                      <span className="text-muted-foreground">Sem unidades</span>
                    ) : (
                      inventory.units.map((linked) => (
                        <Badge key={linked.id} variant="secondary">
                          {linked.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-md:hidden">{inventory.productCount}</TableCell>
                <TableCell className="px-4 text-right tabular-nums">{inventory.quantity}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <InventoryActions workspaceId={workspaceId} inventory={inventory} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={INVENTORY_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="estoques"
      />
    </>
  )
}
