import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import {
  parseProductListQuery,
  PRODUCT_PAGE_SIZE,
  productListPipeline,
  type ProductListPage,
} from "@/service/workspace/[workspaceId]/stock/products/product-list"
import { currencyFormat } from "@/components/shared/service-format"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { SortableHead } from "@/components/shared/sortable-head"
import { CreateProductSheet, ProductActions } from "@/components/workspace/[workspaceId]/stock/product-sheets"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Product } from "@/models/Product"

export default async function ProductsPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/stock/products">) {
  const { workspaceId } = await params
  const query = parseProductListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "stock" })
  const canManage = can(actor, "stock.manage")

  const [result] = await Product.aggregate<ProductListPage>(productListPipeline(workspaceId, query))
  const pathname = `/workspace/${workspaceId}/stock/products`
  const listQuery = { q: query.q, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / PRODUCT_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListSearch query={listQuery} placeholder="Buscar produto..." />
        {canManage && <CreateProductSheet workspaceId={workspaceId} />}
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Produto" query={listQuery} pathname={pathname} className="w-full" />
              <SortableHead field="price" label="Preço" query={listQuery} pathname={pathname} className="text-right @max-md:hidden" />
              <SortableHead field="quantity" label="Em estoque" query={listQuery} pathname={pathname} className="text-right" />
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="max-w-0 truncate px-4 font-medium">{product.name}</TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-md:hidden">
                  {currencyFormat.format(product.priceCents / 100)}
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">{product.quantity}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <ProductActions workspaceId={workspaceId} product={product} />
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
        pageSize={PRODUCT_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="produtos"
      />
    </>
  )
}
