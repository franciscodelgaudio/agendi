import { isObjectIdOrHexString } from "mongoose";

const MAX_NAME_LENGTH = 40;

// Estoque de produtos de uma ou mais unidades. Compartilhado: uma quantidade só por produto.
// Distribuído: cada unidade tem a sua parte e os produtos são transferidos entre elas.
export type StockUnit = { unitId: string };

export type StockData = { name: string; distributed: boolean; units: StockUnit[] };

export type StockInputError = "invalid_input" | "invalid_name" | "name_too_long" | "no_units" | "invalid_units";

type StockDeps = {
  // Confere se todas as unidades são do workspace.
  unitsExist: (workspaceId: string, unitIds: string[]) => Promise<boolean>;
  // Confere se alguma unidade, ao sair do estoque atual, deixaria produtos para trás nele;
  // excludeId é o próprio estoque na edição.
  unitsLeavingWithStock: (unitIds: string[], excludeId: string | null) => Promise<boolean>;
};

// Valida e normaliza os campos como chegam do FormData.
function parseStockInput(input: unknown): ({ ok: true } & StockData) | { ok: false; error: StockInputError } {
  const { name, distributed, units } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !Array.isArray(units)) return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  if (units.length === 0) return { ok: false, error: "no_units" };
  if (!units.every((unitId) => typeof unitId === "string")) return { ok: false, error: "invalid_input" };
  if (new Set(units).size !== units.length) return { ok: false, error: "invalid_input" };
  if (!units.every((unitId) => isObjectIdOrHexString(unitId))) return { ok: false, error: "invalid_units" };

  return {
    ok: true,
    name: normalizedName,
    distributed: Boolean(distributed),
    units: (units as string[]).map((unitId) => ({ unitId })),
  };
}

async function checkUnits(
  units: StockUnit[],
  workspaceId: string,
  excludeId: string | null,
  deps: StockDeps,
): Promise<"invalid_units" | "unit_stock_not_empty" | null> {
  const unitIds = units.map((unit) => unit.unitId);
  if (!(await deps.unitsExist(workspaceId, unitIds))) return "invalid_units";
  if (await deps.unitsLeavingWithStock(unitIds, excludeId)) return "unit_stock_not_empty";
  return null;
}

export type CreateStockError = StockInputError | "unit_stock_not_empty" | "workspace_not_found";

export type CreateStockResult = { ok: true; stockId: string } | { ok: false; error: CreateStockError };

export async function createStock(
  input: unknown,
  workspaceId: string | null | undefined,
  deps: StockDeps & { insert: (data: StockData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateStockResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const parsed = parseStockInput(input);
  if (!parsed.ok) return parsed;
  const { name, distributed, units } = parsed;
  const unitsError = await checkUnits(units, workspaceId, null, deps);
  if (unitsError) return { ok: false, error: unitsError };

  const stock = await deps.insert({ name, distributed, units, workspaceId });
  return { ok: true, stockId: stock.id };
}

export type UpdateStockError =
  | StockInputError
  | "unit_stock_not_empty"
  | "removed_unit_has_stock"
  | "stock_not_found";

export type UpdateStockResult = { ok: true } | { ok: false; error: UpdateStockError };

// O modo (compartilhado ou distribuído) não muda aqui: a troca redistribui as quantidades.
// findUnitIds devolve null e update devolve false quando o estoque não existe (ou não é do workspace).
export async function updateStock(
  input: unknown,
  workspaceId: string | null | undefined,
  stockId: string | null | undefined,
  deps: StockDeps & {
    findUnitIds: (workspaceId: string, stockId: string) => Promise<string[] | null>;
    // Confere se alguma das unidades ainda tem quantidade no estoque distribuído.
    unitsHoldQuantity: (stockId: string, unitIds: string[]) => Promise<boolean>;
    update: (stockId: string, data: Omit<StockData, "distributed">) => Promise<boolean>;
  },
): Promise<UpdateStockResult> {
  if (!workspaceId || !stockId) return { ok: false, error: "stock_not_found" };

  const parsed = parseStockInput(input);
  if (!parsed.ok) return parsed;
  const { name, units } = parsed;

  const currentUnitIds = await deps.findUnitIds(workspaceId, stockId);
  if (!currentUnitIds) return { ok: false, error: "stock_not_found" };
  const removed = currentUnitIds.filter((unitId) => !units.some((unit) => unit.unitId === unitId));
  if (removed.length > 0 && (await deps.unitsHoldQuantity(stockId, removed))) {
    return { ok: false, error: "removed_unit_has_stock" };
  }

  const unitsError = await checkUnits(units, workspaceId, stockId, deps);
  if (unitsError) return { ok: false, error: unitsError };

  const found = await deps.update(stockId, { name, units });
  return found ? { ok: true } : { ok: false, error: "stock_not_found" };
}

export type DeleteStockResult = { ok: true } | { ok: false; error: "stock_not_found" | "stock_not_empty" };

// remove devolve false quando o estoque não existe (ou não é do workspace).
export async function deleteStock(
  stockId: string | null | undefined,
  deps: { hasProducts: (stockId: string) => Promise<boolean>; remove: (stockId: string) => Promise<boolean> },
): Promise<DeleteStockResult> {
  if (!stockId) return { ok: false, error: "stock_not_found" };
  if (await deps.hasProducts(stockId)) return { ok: false, error: "stock_not_empty" };

  const found = await deps.remove(stockId);
  return found ? { ok: true } : { ok: false, error: "stock_not_found" };
}

// Estoque de onde a unidade sai: o próprio quando ela não está em nenhum (unitCount 1).
// unitQuantity é a parte dela no estoque distribuído.
export type StockOrigin = { unitCount: number; productCount: number; distributed: boolean; unitQuantity: number };

// A unidade só pode sair se os produtos continuarem com alguma unidade e, no estoque
// distribuído, se ela não tiver mais nada dele.
export function leavesProductsBehind({ unitCount, productCount, distributed, unitQuantity }: StockOrigin) {
  if (productCount === 0) return false;
  return unitCount === 1 || (distributed && unitQuantity > 0);
}
