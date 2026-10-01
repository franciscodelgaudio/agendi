import { isObjectIdOrHexString } from "mongoose";

const MAX_NAME_LENGTH = 40;

// Estoque compartilhado por várias unidades: uma quantidade só de cada produto para todas. A
// unidade que não está em nenhum tem o próprio estoque.
export type StockUnit = { unitId: string };

export type StockData = { name: string; units: StockUnit[] };

export type StockInputError = "invalid_input" | "invalid_name" | "name_too_long" | "no_units" | "invalid_units";

type StockDeps = {
  // Confere se todas as unidades são do workspace.
  unitsExist: (workspaceId: string, unitIds: string[]) => Promise<boolean>;
};

// Valida e normaliza os campos como chegam do FormData.
function parseStockInput(input: unknown): ({ ok: true } & StockData) | { ok: false; error: StockInputError } {
  const { name, units } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !Array.isArray(units)) return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  if (units.length === 0) return { ok: false, error: "no_units" };
  if (!units.every((unitId) => typeof unitId === "string")) return { ok: false, error: "invalid_input" };
  if (new Set(units).size !== units.length) return { ok: false, error: "invalid_input" };
  if (!units.every((unitId) => isObjectIdOrHexString(unitId))) return { ok: false, error: "invalid_units" };

  return { ok: true, name: normalizedName, units: (units as string[]).map((unitId) => ({ unitId })) };
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
  const { name, units } = parsed;
  if (!(await deps.unitsExist(workspaceId, units.map((unit) => unit.unitId)))) {
    return { ok: false, error: "invalid_units" };
  }

  const stock = await deps.insert({ name, units, workspaceId });
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
  const { name, units } = parsed;
  if (!(await deps.unitsExist(workspaceId, units.map((unit) => unit.unitId)))) {
    return { ok: false, error: "invalid_units" };
  }

  const found = await deps.update(stockId, { name, units });
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

export type StockItemData = { productId: string; quantity: number; depletedAt: Date[] };

// O mesmo produto vindo de vários estoques vira um item: quantidades somadas e todas as vezes
// que acabou, em ordem. Os produtos ficam na ordem em que apareceram.
export function mergeStockItems(items: StockItemData[]): StockItemData[] {
  const merged = new Map<string, StockItemData>();
  for (const { productId, quantity, depletedAt } of items) {
    const current = merged.get(productId);
    merged.set(
      productId,
      current
        ? { productId, quantity: current.quantity + quantity, depletedAt: [...current.depletedAt, ...depletedAt] }
        : { productId, quantity, depletedAt: [...depletedAt] },
    );
  }
  return [...merged.values()].map((item) => ({
    ...item,
    depletedAt: item.depletedAt.sort((a, b) => a.getTime() - b.getTime()),
  }));
}
