import { isObjectIdOrHexString } from "mongoose";
import { addLots, type Lot } from "@/service/workspace/[workspaceId]/stock/stock-lots";

const MAX_NAME_LENGTH = 40;

// Estoque compartilhado por várias unidades: uma quantidade só de cada produto para todas. A
// unidade que não está em nenhum tem o próprio estoque.
export type StockUnit = { unitId: string };

// walletId: carteira que paga as compras do estoque; null quando cada unidade paga as suas.
export type StockData = { name: string; units: StockUnit[]; walletId: string | null };

export type StockInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "no_units"
  | "invalid_units"
  | "wallet_not_found"
  | "wallet_missing_units";

type StockDeps = {
  // Confere se todas as unidades são do workspace.
  unitsExist: (workspaceId: string, unitIds: string[]) => Promise<boolean>;
  // Unidades da carteira do workspace; null quando ela não existe nele.
  findWalletUnits: (workspaceId: string, walletId: string) => Promise<string[] | null>;
};

// Valida e normaliza os campos como chegam do FormData; carteira vazia vira null.
function parseStockInput(input: unknown): ({ ok: true } & StockData) | { ok: false; error: StockInputError } {
  const { name, units, walletId } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !Array.isArray(units)) return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  if (units.length === 0) return { ok: false, error: "no_units" };
  if (!units.every((unitId) => typeof unitId === "string")) return { ok: false, error: "invalid_input" };
  if (new Set(units).size !== units.length) return { ok: false, error: "invalid_input" };
  if (!units.every((unitId) => isObjectIdOrHexString(unitId))) return { ok: false, error: "invalid_units" };

  const wallet = walletId == null || walletId === "" ? null : walletId;
  if (wallet !== null && (typeof wallet !== "string" || !isObjectIdOrHexString(wallet))) {
    return { ok: false, error: "wallet_not_found" };
  }

  return { ok: true, name: normalizedName, units: (units as string[]).map((unitId) => ({ unitId })), walletId: wallet };
}

// Unidades do workspace e, com carteira, que ela tenha todas as unidades do estoque.
async function checkStock(
  { units, walletId }: StockData,
  workspaceId: string,
  deps: StockDeps,
): Promise<StockInputError | null> {
  const unitIds = units.map((unit) => unit.unitId);
  if (!(await deps.unitsExist(workspaceId, unitIds))) return "invalid_units";
  if (!walletId) return null;
  const walletUnits = await deps.findWalletUnits(workspaceId, walletId);
  if (!walletUnits) return "wallet_not_found";
  return unitIds.every((unitId) => walletUnits.includes(unitId)) ? null : "wallet_missing_units";
}

// Estoques que perdem a carteira: a dela não existe mais ou não tem todas as unidades dele.
export function staleStockWalletLinks(
  stocks: { id: string; walletId: string | null; unitIds: string[] }[],
  wallets: { id: string; unitIds: string[] }[],
): string[] {
  const unitsByWallet = new Map(wallets.map((wallet) => [wallet.id, new Set(wallet.unitIds)]));
  return stocks
    .filter((stock) => {
      if (!stock.walletId) return false;
      const walletUnits = unitsByWallet.get(stock.walletId);
      return !walletUnits || !stock.unitIds.every((unitId) => walletUnits.has(unitId));
    })
    .map((stock) => stock.id);
}

export type CreateStockError = StockInputError | "workspace_not_found";

export type CreateStockResult = { ok: true; stockId: string } | { ok: false; error: CreateStockError };

// Unidade que já está em outro estoque sai de lá; quem grava junta o que as unidades trazem.
export async function createStock(
  input: unknown,
  workspaceId: string | null | undefined,
  deps: StockDeps & { insert: (data: StockData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateStockResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const parsed = parseStockInput(input);
  if (!parsed.ok) return parsed;
  const { name, units, walletId } = parsed;
  const error = await checkStock(parsed, workspaceId, deps);
  if (error) return { ok: false, error };

  const stock = await deps.insert({ name, units, walletId, workspaceId });
  return { ok: true, stockId: stock.id };
}

export type UpdateStockError = StockInputError | "stock_not_found";

export type UpdateStockResult = { ok: true } | { ok: false; error: UpdateStockError };

// update devolve false quando o estoque não existe (ou não é do workspace).
export async function updateStock(
  input: unknown,
  workspaceId: string | null | undefined,
  stockId: string | null | undefined,
  deps: StockDeps & { update: (stockId: string, data: StockData) => Promise<boolean> },
): Promise<UpdateStockResult> {
  if (!workspaceId || !stockId) return { ok: false, error: "stock_not_found" };

  const parsed = parseStockInput(input);
  if (!parsed.ok) return parsed;
  const { name, units, walletId } = parsed;
  const error = await checkStock(parsed, workspaceId, deps);
  if (error) return { ok: false, error };

  const found = await deps.update(stockId, { name, units, walletId });
  return found ? { ok: true } : { ok: false, error: "stock_not_found" };
}

export type DeleteStockResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "invalid_units" | "stock_not_found" };

// As quantidades do estoque vão para a unidade escolhida, que precisa ser dele. findUnitIds
// devolve null e remove devolve false quando o estoque não existe (ou não é do workspace).
export async function deleteStock(
  input: unknown,
  workspaceId: string | null | undefined,
  stockId: string | null | undefined,
  deps: {
    findUnitIds: (workspaceId: string, stockId: string) => Promise<string[] | null>;
    remove: (stockId: string, unitId: string) => Promise<boolean>;
  },
): Promise<DeleteStockResult> {
  if (!workspaceId || !stockId) return { ok: false, error: "stock_not_found" };

  const { unitId } = (input ?? {}) as Record<string, unknown>;
  if (typeof unitId !== "string") return { ok: false, error: "invalid_input" };

  const unitIds = await deps.findUnitIds(workspaceId, stockId);
  if (!unitIds) return { ok: false, error: "stock_not_found" };
  if (!unitIds.includes(unitId)) return { ok: false, error: "invalid_units" };

  const found = await deps.remove(stockId, unitId);
  return found ? { ok: true } : { ok: false, error: "stock_not_found" };
}

export type StockItemData = { productId: string; lots: Lot[]; depletedAt: Date[] };

// O mesmo produto vindo de vários estoques vira um item: os lotes de todos em ordem de compra e
// todas as vezes que acabou, em ordem. Os produtos ficam na ordem em que apareceram.
export function mergeStockItems(items: StockItemData[]): StockItemData[] {
  const merged = new Map<string, StockItemData>();
  for (const { productId, lots, depletedAt } of items) {
    const current = merged.get(productId);
    merged.set(productId, {
      productId,
      lots: addLots(current?.lots ?? [], lots),
      depletedAt: [...(current?.depletedAt ?? []), ...depletedAt],
    });
  }
  return [...merged.values()].map((item) => ({
    ...item,
    depletedAt: item.depletedAt.sort((a, b) => a.getTime() - b.getTime()),
  }));
}
