import { notFound } from "next/navigation"
import { PackageIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseProductListQuery, productListPipeline } from "@/lib/product-list"
import { findProductUsage } from "@/lib/product-lookup"
import { Product } from "@/models/Product"
import { Stock } from "@/models/Stock"
import { Workspace } from "@/models/Workspace"
import { ListSearch } from "@/components/list-search"
import { ProductTable } from "@/components/product-table"
import { StockList } from "@/components/stock-list"
import { CreateStockSheet } from "@/components/stock-sheets"
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
  stockId: string | null
  name: string
  quantity: number
  costCents: number
  notes: string | null
  rating: number | null
  avatarUrl: string | null
}

// Estoque de todas as unidades numa lista só, com a unidade (ou o estoque de várias unidades)
// de cada produto abaixo do nome, e os estoques de várias unidades. Cadastrar continua na aba
// Estoque da unidade.
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
        id: { $toString: "$_id" },
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
  const stockDocs = await Stock.find({ workspaceId: workspace.id }).sort({ name: 1, _id: 1 }).lean()
  const stockProducts = await Product.find({ stockId: { $in: stockDocs.map((stock) => stock._id) } })
    .select({ name: 1, quantity: 1, stockId: 1 })
    .sort({ name: 1, _id: 1 })
    .lean()
  const stocks = stockDocs.map((stock) => ({
    id: stock._id.toString(),
    name: stock.name,
    distributed: stock.distributed,
    units: stock.units
      .map((unit) => ({ id: unit.unitId.toString(), name: unitNames.get(unit.unitId.toString())! }))
      .filter((unit) => unit.name !== undefined),
    products: stockProducts
      .filter((product) => product.stockId?.equals(stock._id))
      .map((product) => ({ id: product._id.toString(), name: product.name, quantity: product.quantity })),
  }))
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]))

  // Produto de um estoque de várias unidades abre pela unidade que cadastrou, se ela ainda
  // estiver lá, senão pela primeira; fora disso, pela própria unidade.
  const rows = workspace.products.map((product) => {
    const stock = product.stockId ? stocksById.get(product.stockId) : undefined
    const unitId =
      stock && !stock.units.some((unit) => unit.id === product.unitId) ? (stock.units[0]?.id ?? product.unitId) : product.unitId
    return { ...product, unitId, origin: stock ? stock.name : unitNames.get(product.unitId) }
  })
  const usageOf = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => row.unitId))].map(async (unitId) => [unitId, await findProductUsage(unitId)] as const),
    ),
  )
  const products = rows.map((row) => ({ ...row, usage: usageOf.get(row.unitId)!(row.id) }))
  const stockOptions = canManage
    ? units.map((unit) => {
        const stock = stocks.find((s) => s.units.some((u) => u.id === unit.id))
        return { id: unit.id, name: unit.name, stockId: stock?.id ?? null, stockName: stock?.name ?? null }
      })
    : null

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
      {units.length > 1 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold tracking-tight">Estoques de várias unidades</h4>
            {stockOptions && <CreateStockSheet workspaceId={workspaceId} units={stockOptions} />}
          </div>
          <StockList stocks={stocks} workspaceId={workspaceId} units={stockOptions} />
        </>
      )}
    </div>
  )
}
