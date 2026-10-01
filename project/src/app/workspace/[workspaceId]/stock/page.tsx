import { notFound } from "next/navigation"
import { PackageIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseProductListQuery, productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { Workspace } from "@/models/Workspace"
import { ListSearch } from "@/components/list-search"
import { ProductTable } from "@/components/product-table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type ProductRow = {
  id: string
  unitId: string
  name: string
  quantity: number
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
}

// Estoque de todas as unidades numa lista só, com a unidade de cada produto abaixo do nome.
// Cadastrar continua na aba Estoque da unidade, que é onde o produto mora.
export default async function WorkspaceStockPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params
  const query = parseProductListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "stock" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace para garantir o acesso; os produtos são os de qualquer unidade dele.
  // O total sem filtro separa "nenhum produto" de "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    units: { id: string; name: string }[]
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
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "units._id",
        foreignField: "unitId",
        as: "products",
        pipeline: productListPipeline(query),
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "units._id",
        foreignField: "unitId",
        as: "productCount",
        pipeline: [{ $count: "n" }],
      },
    },
    {
      $project: {
        _id: 0,
        actor: 1,
        units: { $map: { input: "$units", in: { id: { $toString: "$$this._id" }, name: "$$this.name" } } },
        products: 1,
        productCount: { $ifNull: [{ $first: "$productCount.n" }, 0] },
      },
    },
  ])
  if (!workspace) notFound()
  const { units, productCount } = workspace
  const canManage = can(workspace.actor, "stock.manage")

  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))
  const usageOf = new Map(
    await Promise.all(units.map(async (unit) => [unit.id, await findProductUsage(unit.id)] as const)),
  )
  const products = workspace.products.map((product) => ({
    ...product,
    unitName: unitNames.get(product.unitId),
    usage: usageOf.get(product.unitId)!(product.id),
  }))

  const pathname = `/workspace/${workspaceId}/stock`
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Estoque</h2>
      {productCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto em estoque</EmptyTitle>
            <EmptyDescription>
              {units.length === 0
                ? "Crie uma unidade para cadastrar os produtos dela."
                : "Os produtos cadastrados no estoque de cada unidade aparecem aqui."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ListSearch query={query} placeholder="Buscar produto..." />
          <ProductTable
            products={products}
            query={query}
            pathname={pathname}
            workspaceId={workspaceId}
            canManage={canManage}
          />
        </>
      )}
    </div>
  )
}
