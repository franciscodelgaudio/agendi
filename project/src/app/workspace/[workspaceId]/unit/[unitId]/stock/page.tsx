import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { PackageIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseProductListQuery, productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { findHolderByUnit, findUnitHolder } from "@/lib/stock-store"
import { Product } from "@/models/Product"
import { StockItem } from "@/models/StockItem"
import { Workspace } from "@/models/Workspace"
import { AddStockItemSheet } from "@/components/add-stock-item-sheet"
import { CreateProductSheet } from "@/components/create-product-sheet"
import { ListSearch } from "@/components/list-search"
import { ProductActions, type ProductTransfer } from "@/components/product-actions"
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

// Produtos do catálogo que estão no estoque da unidade (o compartilhado, se ela estiver num),
// com a quantidade de lá. Layout e página podem renderizar em paralelo, então a página refaz a
// verificação de acesso.
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
  const holder = await findUnitHolder(unitId)

  // Parte do workspace -> unidade para garantir o acesso; os produtos são os do catálogo do
  // workspace que estão no estoque. O total sem filtro separa "estoque vazio" de "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    id: string
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
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    { $match: { "units.id": unitId } },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "workspaceId",
        as: "products",
        pipeline: productListPipeline(query, holder.holderId),
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "workspaceId",
        as: "productCount",
        pipeline: [...productListPipeline({ ...query, q: "" }, holder.holderId).slice(0, 2), { $count: "n" }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        actor: 1,
        units: 1,
        products: 1,
        productCount: { $ifNull: [{ $first: "$productCount.n" }, 0] },
      },
    },
  ])
  if (!workspace) notFound()
  const { units, productCount } = workspace
  const canManage = can(workspace.actor, "stock.manage")
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))

  const usageOf = await findProductUsage({ holderIds: [holder.holderId], unitIds: holder.unitIds })
  const pathname = `/workspace/${workspaceId}/unit/${unitId}/stock`
  const products = workspace.products.map((product) => ({
    ...product,
    href: `${pathname}/${product.id}`,
    usage: usageOf(product.id),
  }))

  // Produtos do catálogo que ainda não estão neste estoque, para adicionar.
  const catalog = canManage
    ? await Product.find({
        workspaceId: workspace.id,
        _id: { $nin: await StockItem.distinct("productId", { holderId: new Types.ObjectId(holder.holderId) }) },
      })
        .select({ name: 1 })
        .sort({ name: 1, _id: 1 })
        .lean()
    : []
  const catalogOptions = catalog.map((product) => ({ id: product._id.toString(), name: product.name }))

  // Transferir: quanto de cada produto o estoque de cada unidade tem.
  const transferOf = await (async () => {
    if (!canManage || !can(workspace.actor, "stock.transfer") || units.length < 2) return null
    const holderByUnit = await findHolderByUnit(workspace.id, units.map((unit) => unit.id))
    const items = await StockItem.find({
      productId: { $in: products.map((product) => new Types.ObjectId(product.id)) },
      holderId: { $in: [...new Set(holderByUnit.values())].map((id) => new Types.ObjectId(id)) },
    })
      .select({ productId: 1, holderId: 1, quantity: 1 })
      .lean()
    const byKey = new Map(items.map((item) => [`${item.productId}:${item.holderId}`, item.quantity]))
    return (productId: string): ProductTransfer => ({
      units,
      quantities: Object.fromEntries(
        units.map((unit) => [unit.id, byKey.get(`${productId}:${holderByUnit.get(unit.id)}`) ?? 0]),
      ),
    })
  })()

  const sharedWith = holder.unitIds.filter((id) => id !== unitId).map((id) => unitNames.get(id)).filter(Boolean)
  const addActions = canManage && (
    <div className="flex flex-wrap gap-2">
      {catalogOptions.length > 0 && <AddStockItemSheet workspaceId={workspaceId} unitId={unitId} products={catalogOptions} />}
      <CreateProductSheet workspaceId={workspaceId} unitId={unitId} />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h3 className="text-lg font-semibold tracking-tight">Estoque</h3>
          {holder.stock && (
            <p className="text-sm text-muted-foreground">
              {holder.stock.name}: estoque compartilhado com {sharedWith.join(", ")}.
            </p>
          )}
        </div>
        {productCount > 0 && addActions}
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
                ? "Cadastre um produto novo ou adicione um do catálogo, com a quantidade que esta unidade tem."
                : "Esta unidade ainda não tem produtos em estoque."}
            </EmptyDescription>
          </EmptyHeader>
          {addActions && <EmptyContent>{addActions}</EmptyContent>}
        </Empty>
      ) : (
        <>
          <ListSearch query={query} placeholder="Buscar produto..." />
          <ProductTable
            products={products}
            query={query}
            pathname={pathname}
            actions={
              canManage
                ? (product) => (
                    <ProductActions
                      workspaceId={workspaceId}
                      unitId={unitId}
                      product={product}
                      transfer={transferOf?.(product.id) ?? null}
                    />
                  )
                : undefined
            }
          />
        </>
      )}
    </div>
  )
}
