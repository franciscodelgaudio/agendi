import { notFound } from "next/navigation"
import { Types } from "mongoose"
import { ArchiveIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { parseProductListQuery } from "@/service/workspace/[workspaceId]/stock/products/product-list"
import { escapeRegex } from "@/service/workspace/[workspaceId]/unit/unit-list"
import { Product } from "@/models/Product"
import { Stock } from "@/models/Stock"
import { StockItem } from "@/models/StockItem"
import { Wallet } from "@/models/Wallet"
import { Workspace } from "@/models/Workspace"
import Link from "@/components/shared/link"
import { ListSearch } from "@/components/shared/list-search"
import { StockList } from "@/components/workspace/[workspaceId]/stock/stock-list"
import { AddStockItemSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/stock/add-stock-item-sheet"
import { CreateStockSheet } from "@/components/workspace/[workspaceId]/stock/stock-sheets"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Quanto de cada produto há em cada estoque: o compartilhado de várias unidades e o próprio
// das unidades que não estão em nenhum. Abaixo, os estoques compartilhados.
export default async function WorkspaceStockPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params
  const { q } = parseProductListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "stock" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace para garantir o acesso.
  const [workspace] = await Workspace.aggregate<{ id: string; actor: Actor; units: { id: string; name: string }[] }>([
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
    { $project: { _id: 0, id: { $toString: "$_id" }, actor: 1, units: 1 } },
  ])
  if (!workspace) notFound()
  const { units } = workspace
  const canManage = can(workspace.actor, "stock.manage")
  // Ligar o estoque à carteira e pagar por ela mexem no dinheiro: pedem gerenciar o caixa.
  const canUseWallet = canManage && can(workspace.actor, "cash_flow.manage")
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))

  const [stockDocs, walletDocs] = await Promise.all([
    Stock.find({ workspaceId: workspace.id }).sort({ name: 1, _id: 1 }).lean(),
    Wallet.find({ workspaceId: workspace.id }).select({ name: 1, units: 1 }).lean(),
  ])
  const walletNames = new Map(walletDocs.map((wallet) => [wallet._id.toString(), wallet.name]))
  const unitWallet = new Map(
    walletDocs.flatMap((wallet) => wallet.units.map((unit) => [unit.unitId.toString(), wallet] as const)),
  )
  const stocks = stockDocs.map((stock) => {
    const walletId = stock.walletId?.toString() ?? null
    return {
      id: stock._id.toString(),
      name: stock.name,
      units: stock.units
        .map((unit) => unit.unitId.toString())
        .filter((unitId) => unitNames.has(unitId))
        .map((unitId) => ({ id: unitId, name: unitNames.get(unitId)! })),
      walletId,
      walletName: (walletId && walletNames.get(walletId)) || null,
    }
  })
  const unitStock = new Map(stocks.flatMap((stock) => stock.units.map((unit) => [unit.id, stock] as const)))

  // Colunas: os compartilhados e as unidades fora deles; o link abre o estoque de uma unidade.
  const holders = [
    ...stocks.map((stock) => ({
      id: stock.id,
      name: stock.name,
      detail: stock.units.map((unit) => unit.name).join(", "),
      unitId: stock.units[0]?.id ?? null,
    })),
    ...units
      .filter((unit) => !unitStock.has(unit.id))
      .map((unit) => ({ id: unit.id, name: unit.name, detail: null, unitId: unit.id })),
  ]

  const items = await StockItem.find({ holderId: { $in: holders.map((holder) => new Types.ObjectId(holder.id)) } })
    .select({ productId: 1, holderId: 1, quantity: 1 })
    .lean()
  const quantities = new Map(items.map((item) => [`${item.productId}:${item.holderId}`, item.quantity]))
  const products = await Product.find({
    workspaceId: workspace.id,
    _id: { $in: [...new Set(items.map((item) => item.productId.toString()))] },
    ...(q && { name: { $regex: escapeRegex(q), $options: "i" } }),
  })
    .select({ name: 1 })
    .sort({ name: 1, _id: 1 })
    .lean()

  const stockOptions = canManage
    ? units.map((unit) => {
        const stock = unitStock.get(unit.id)
        const wallet = unitWallet.get(unit.id)
        return {
          id: unit.id,
          name: unit.name,
          stockId: stock?.id ?? null,
          stockName: stock?.name ?? null,
          walletId: wallet?._id.toString() ?? null,
          walletName: wallet?.name ?? null,
        }
      })
    : null

  // Catálogo do workspace, para adicionar aos estoques.
  const catalog = canManage
    ? await Product.find({ workspaceId: workspace.id }).select({ name: 1 }).sort({ name: 1, _id: 1 }).lean()
    : []
  const catalogOptions = catalog.map((product) => ({ id: product._id.toString(), name: product.name }))

  // Para adicionar em cada compartilhado: os produtos do catálogo que ainda não estão nele e quem
  // pode pagar a compra (a carteira ligada a ele primeiro, depois as unidades).
  const catalogs = Object.fromEntries(
    stocks.map((stock) => [
      stock.id,
      catalogOptions.filter((product) => !quantities.has(`${product.id}:${stock.id}`)),
    ]),
  )
  const payers = Object.fromEntries(
    stocks.map((stock) => [
      stock.id,
      [
        ...(canUseWallet && stock.walletName ? [{ value: "wallet", label: `Carteira ${stock.walletName}` }] : []),
        ...stock.units.map((unit) => ({ value: unit.id, label: unit.name })),
      ],
    ]),
  )
  // Sem nada em estoque, qualquer estoque recebe qualquer produto do catálogo; a unidade fora de
  // compartilhado paga a própria compra.
  const targets = [
    ...stocks
      .filter((stock) => stock.units.length > 0)
      .map((stock) => ({
        kind: "stock" as const,
        id: stock.id,
        name: stock.name,
        products: catalogs[stock.id],
        payers: payers[stock.id],
      })),
    ...units
      .filter((unit) => !unitStock.has(unit.id))
      .map((unit) => ({ kind: "unit" as const, id: unit.id, name: unit.name, products: catalogOptions, payers: [] })),
  ]

  return (
    <>
      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArchiveIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto em estoque</EmptyTitle>
            <EmptyDescription>
              {units.length === 0
                ? "Crie uma unidade para cadastrar os produtos do estoque dela."
                : "Os produtos cadastrados no estoque de cada unidade aparecem aqui, com a quantidade em cada uma."}
            </EmptyDescription>
          </EmptyHeader>
          {units.length > 0 && catalogOptions.length > 0 && (
            <EmptyContent>
              <AddStockItemSheet workspaceId={workspaceId} targets={targets} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ListSearch query={{ q }} placeholder="Buscar produto..." />
          <div className="overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Produto</TableHead>
                  {holders.map((holder) => (
                    <TableHead key={holder.id} className="px-4 text-right" title={holder.detail ?? undefined}>
                      {holder.unitId ? (
                        <Link href={`/workspace/${workspaceId}/unit/${holder.unitId}/stock`} className="hover:underline">
                          {holder.name}
                        </Link>
                      ) : (
                        holder.name
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="px-4 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={holders.length + 2} className="h-24 px-4 text-center text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => {
                    const row = holders.map((holder) => quantities.get(`${product._id}:${holder.id}`))
                    return (
                      <TableRow key={product._id.toString()}>
                        <TableCell className="px-4 font-medium">{product.name}</TableCell>
                        {row.map((quantity, i) => (
                          <TableCell key={holders[i].id} className="px-4 text-right tabular-nums">
                            {quantity ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                        <TableCell className="px-4 text-right font-medium tabular-nums">
                          {row.reduce<number>((sum, quantity) => sum + (quantity ?? 0), 0)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {units.length > 1 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold tracking-tight">Estoques compartilhados</h4>
            {stockOptions && <CreateStockSheet workspaceId={workspaceId} units={stockOptions} canLinkWallet={canUseWallet} />}
          </div>
          <StockList
            stocks={stocks}
            workspaceId={workspaceId}
            units={stockOptions}
            canLinkWallet={canUseWallet}
            catalogs={catalogs}
            payers={payers}
          />
        </>
      )}
    </>
  )
}
