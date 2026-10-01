import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { PackageIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseProductListQuery, productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { productScopeMatch } from "@/lib/product-scope"
import { findUnitScope, unitQuantityOf } from "@/lib/stock-store"
import { Unit } from "@/models/Unit"
import { Workspace } from "@/models/Workspace"
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
  unitId: string
  unitQuantities: { unitId: string; quantity: number }[]
  name: string
  quantity: number
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
}

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function StockPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/stock">) {
  const { workspaceId, unitId } = await params
  const query = parseProductListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "stock", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()
  // Num estoque de várias unidades, os produtos são os do estoque; a unidade é conferida abaixo.
  const { stock, scope } = await findUnitScope(unitId)
  const scopeMatch = { $match: productScopeMatch(scope) }

  // Parte do workspace -> unidade -> produtos para que o acesso seja garantido em cada nível.
  // O total sem filtro separa "unidade sem produtos" de "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { products: ProductRow[]; productCount: number } | null
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $lookup: {
              from: "products",
              as: "products",
              pipeline: [scopeMatch, ...productListPipeline(query)],
            },
          },
          {
            $lookup: {
              from: "products",
              as: "productCount",
              pipeline: [scopeMatch, { $count: "n" }],
            },
          },
          {
            $project: {
              _id: 0,
              products: 1,
              productCount: { $ifNull: [{ $first: "$productCount.n" }, 0] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { products: rows, productCount } = workspace.unit
  const canManage = can(workspace.actor, "stock.manage")

  // Estoque distribuído: a quantidade mostrada e editada é a da unidade, com o total ao lado.
  // As ações rodam sempre a partir desta unidade, mesmo no produto cadastrado por outra.
  const usageOf = await findProductUsage(unitId)
  const products = rows.map((product) => {
    const own = stock?.distributed ? unitQuantityOf(product.unitQuantities, unitId) : product.quantity
    return {
      ...product,
      unitId,
      quantity: own,
      origin: stock && (stock.distributed ? `${stock.name} · ${product.quantity} no total` : stock.name),
      usage: usageOf(product.id),
    }
  })
  // Transferir só existe no estoque distribuído, para quem tem a permissão.
  const transferUnits =
    stock?.distributed && canManage && can(workspace.actor, "stock.transfer")
      ? (await Unit.find({ _id: { $in: stock.unitIds } }).select({ name: 1 }).sort({ name: 1 }).lean()).map((unit) => ({
          id: unit._id.toString(),
          name: unit.name,
        }))
      : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Estoque</h3>
        {canManage && productCount > 0 && <CreateProductSheet workspaceId={workspaceId} unitId={unitId} />}
      </div>
      {productCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto em estoque</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Cadastre os produtos desta unidade, com quantidade, preço de custo e avaliação."
                : "Esta unidade ainda não tem produtos cadastrados."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreateProductSheet workspaceId={workspaceId} unitId={unitId} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ListSearch query={query} placeholder="Buscar produto..." />
          <ProductTable
            products={products}
            query={query}
            pathname={`/workspace/${workspaceId}/unit/${unitId}/stock`}
            workspaceId={workspaceId}
            canManage={canManage}
            transferUnits={transferUnits}
          />
        </>
      )}
    </div>
  )
}
