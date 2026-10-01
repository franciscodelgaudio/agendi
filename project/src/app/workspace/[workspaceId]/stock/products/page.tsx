import { notFound } from "next/navigation"
import { PackageIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseProductListQuery, productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { Stock } from "@/models/Stock"
import { Workspace } from "@/models/Workspace"
import { CatalogProductActions } from "@/components/catalog-product-actions"
import { CreateProductSheet } from "@/components/create-product-sheet"
import { ListSearch } from "@/components/list-search"
import { ProductTable } from "@/components/product-table"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type ProductRow = {
  id: string
  name: string
  quantity: number
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
}

// Catálogo de produtos do workspace, cadastrados uma vez só, com a soma de todos os estoques.
// A quantidade é informada no estoque de cada unidade.
export default async function StockProductsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/stock/products">) {
  const { workspaceId } = await params
  const query = parseProductListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "stock" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace para garantir o acesso. O total sem filtro separa "nenhum produto" de
  // "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    unitIds: string[]
    products: ProductRow[]
    productCount: number
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $project: { _id: 1 } }],
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "workspaceId",
        as: "products",
        pipeline: productListPipeline(query),
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "workspaceId",
        as: "productCount",
        pipeline: [{ $count: "n" }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        actor: 1,
        unitIds: { $map: { input: "$units", in: { $toString: "$$this._id" } } },
        products: 1,
        productCount: { $ifNull: [{ $first: "$productCount.n" }, 0] },
      },
    },
  ])
  if (!workspace) notFound()
  const { unitIds, productCount } = workspace
  const canManage = can(workspace.actor, "stock.manage")

  // Uso em todos os estoques: o de cada unidade e os compartilhados.
  const stockIds = (await Stock.find({ workspaceId: workspace.id }).select({ _id: 1 }).lean()).map((stock) =>
    stock._id.toString(),
  )
  const usageOf = await findProductUsage({ holderIds: [...unitIds, ...stockIds], unitIds })
  const products = workspace.products.map((product) => ({ ...product, usage: usageOf(product.id) }))

  return productCount === 0 ? (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageIcon />
        </EmptyMedia>
        <EmptyTitle>Nenhum produto cadastrado</EmptyTitle>
        <EmptyDescription>
          {canManage
            ? "Cadastre os produtos uma vez só; depois, informe a quantidade no estoque de cada unidade."
            : "Os produtos cadastrados aparecem aqui, uma vez só cada um."}
        </EmptyDescription>
      </EmptyHeader>
      {canManage && (
        <EmptyContent>
          <CreateProductSheet workspaceId={workspaceId} />
        </EmptyContent>
      )}
    </Empty>
  ) : (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListSearch query={query} placeholder="Buscar produto..." />
        {canManage && <CreateProductSheet workspaceId={workspaceId} />}
      </div>
      <ProductTable
        products={products}
        query={query}
        pathname={`/workspace/${workspaceId}/stock/products`}
        actions={canManage ? (product) => <CatalogProductActions workspaceId={workspaceId} product={product} /> : undefined}
      />
    </>
  )
}
