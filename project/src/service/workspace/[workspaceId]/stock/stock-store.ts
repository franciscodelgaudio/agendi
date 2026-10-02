import { Types } from "mongoose"
import type { Lot } from "@/service/workspace/[workspaceId]/stock/stock-lots"
import { staleStockWalletLinks } from "@/service/workspace/[workspaceId]/stock/stock"
import { Wallet } from "@/models/Wallet"
import { Stock } from "@/models/Stock"
import { StockItem } from "@/models/StockItem"
import { StockMovement } from "@/models/StockMovement"

// Estoque compartilhado em que a unidade está; walletId é a carteira que paga as compras dele.
export type UnitStock = { id: string; name: string; unitIds: string[]; walletId: string | null }

// Estoque que a unidade usa: holderId é o do compartilhado ou o dela mesma; unitIds, as
// unidades que usam esse estoque.
export type UnitHolder = { stock: UnitStock | null; holderId: string; unitIds: string[] }

// null quando a unidade não está em nenhum estoque compartilhado.
export async function findUnitStock(unitId: string): Promise<UnitStock | null> {
  const stock = await Stock.findOne({ "units.unitId": new Types.ObjectId(unitId) })
    .select({ name: 1, units: 1, walletId: 1 })
    .lean()
  return (
    stock && {
      id: stock._id.toString(),
      name: stock.name,
      unitIds: stock.units.map((unit) => unit.unitId.toString()),
      walletId: stock.walletId?.toString() ?? null,
    }
  )
}

export function holderOf(unitId: string, stock: UnitStock | null): UnitHolder {
  return stock ? { stock, holderId: stock.id, unitIds: stock.unitIds } : { stock, holderId: unitId, unitIds: [unitId] }
}

export async function findUnitHolder(unitId: string) {
  return holderOf(unitId, await findUnitStock(unitId))
}

// Estoque de cada unidade do workspace (unitId -> holderId).
export async function findHolderByUnit(workspaceId: string, unitIds: string[]) {
  const stocks = await Stock.find({ workspaceId }).select({ units: 1 }).lean()
  const byUnit = new Map(unitIds.map((unitId) => [unitId, unitId]))
  for (const stock of stocks) {
    for (const unit of stock.units) byUnit.set(unit.unitId.toString(), stock._id.toString())
  }
  return byUnit
}

// unitId é null e walletId diz a carteira quando ela pagou a compra.
type Movement = {
  productId: string
  holderId: string
  unitId: string | null
  walletId?: string | null
  kind: "purchase" | "adjustment" | "depletion" | "transfer"
  quantity: number
  toUnitId?: string
  costCents?: number
  createdBy: string
}

// Quantidade zero não é movimentação.
export async function recordMovement({ quantity, ...movement }: Movement) {
  if (quantity <= 0) return
  await StockMovement.create({
    ...movement,
    quantity,
    walletId: movement.walletId ?? null,
    toUnitId: movement.toUnitId ?? null,
    costCents: movement.costCents ?? 0,
  })
}

// Lotes como vêm do banco (subdocumentos), no formato da lógica do PEPS.
export function toLots(lots: { quantity: number; unitCostCents: number; purchasedAt: Date }[]): Lot[] {
  return lots.map(({ quantity, unitCostCents, purchasedAt }) => ({ quantity, unitCostCents, purchasedAt }))
}

// Troca os lotes de um item a partir dos atuais, só se ninguém os alterou desde a leitura
// (os lotes no filtro são os lidos); tenta de novo algumas vezes. change devolve os lotes novos, ou um resultado
// para parar sem gravar. null quando o item não existe.
export async function updateItemLots<T>(
  filter: { holderId: Types.ObjectId; productId: Types.ObjectId },
  change: (lots: Lot[]) => { lots: Lot[]; result: T } | { stop: T },
  extra: Record<string, unknown> = {},
): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = await StockItem.findOne(filter).select({ lots: 1 }).lean()
    if (!item) return null
    const next = change(toLots(item.lots))
    if ("stop" in next) return next.stop
    const { matchedCount } = await StockItem.updateOne(
      { ...filter, lots: item.lots },
      {
        $set: { lots: next.lots, quantity: next.lots.reduce((sum, lot) => sum + lot.quantity, 0) },
        ...extra,
      },
    )
    if (matchedCount > 0) return next.result
  }
  throw new Error("O estoque mudou várias vezes seguidas; tente de novo.")
}

// Tira a carteira dos estoques do workspace em que ela não vale mais (excluída, ou sem todas as
// unidades do estoque). Roda depois de mudar unidades de estoques ou de carteiras.
export async function unlinkStaleStockWallets(workspaceId: string) {
  const [stocks, wallets] = await Promise.all([
    Stock.find({ workspaceId, walletId: { $ne: null } }).select({ walletId: 1, units: 1 }).lean(),
    Wallet.find({ workspaceId }).select({ units: 1 }).lean(),
  ])
  const stale = staleStockWalletLinks(
    stocks.map((stock) => ({
      id: stock._id.toString(),
      walletId: stock.walletId?.toString() ?? null,
      unitIds: stock.units.map((unit) => unit.unitId.toString()),
    })),
    wallets.map((wallet) => ({ id: wallet._id.toString(), unitIds: wallet.units.map((unit) => unit.unitId.toString()) })),
  )
  if (stale.length > 0) await Stock.updateMany({ _id: { $in: stale } }, { $set: { walletId: null } })
}
