import { isObjectIdOrHexString } from "mongoose";

const MAX_QUANTITY = 1_000_000;

// Parte do produto que está numa unidade do estoque distribuído.
export type UnitQuantity = { unitId: string; quantity: number };

// Quantidade inteira de 0 a MAX_QUANTITY, como vem do FormData; null quando inválida.
function parseQuantity(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity <= MAX_QUANTITY ? quantity : null;
}

// Edição da quantidade de uma unidade no estoque distribuído: o total acompanha a diferença.
// previousQuantity é a parte de antes da unidade, para lançar a compra pelo que entrou.
export function setUnitQuantity(
  product: { quantity: number; unitQuantities: UnitQuantity[] },
  unitId: string,
  quantity: number,
) {
  const previousQuantity = product.unitQuantities.find((unit) => unit.unitId === unitId)?.quantity ?? 0;
  const unitQuantities = product.unitQuantities.some((unit) => unit.unitId === unitId)
    ? product.unitQuantities.map((unit) => (unit.unitId === unitId ? { unitId, quantity } : unit))
    : [...product.unitQuantities, { unitId, quantity }];

  return { quantity: product.quantity - previousQuantity + quantity, previousQuantity, unitQuantities };
}

export type TransferData = { fromUnitId: string; toUnitId: string; quantity: number };

export type TransferProductError =
  | "invalid_input"
  | "invalid_units"
  | "same_unit"
  | "invalid_quantity"
  | "product_not_found"
  | "not_distributed"
  | "insufficient_stock";

export type TransferProductResult = { ok: true } | { ok: false; error: TransferProductError };

// transfer tira da origem e põe no destino numa só escrita, só se a origem tiver a quantidade.
export async function transferProduct(
  input: unknown,
  productId: string | null | undefined,
  transfer: (
    productId: string,
    data: TransferData,
  ) => Promise<"transferred" | "not_found" | "not_distributed" | "invalid_units" | "insufficient_stock">,
): Promise<TransferProductResult> {
  if (!productId) return { ok: false, error: "product_not_found" };

  const { fromUnitId, toUnitId, quantity } = (input ?? {}) as Record<string, unknown>;
  if (typeof fromUnitId !== "string" || typeof toUnitId !== "string" || typeof quantity !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!isObjectIdOrHexString(fromUnitId) || !isObjectIdOrHexString(toUnitId)) {
    return { ok: false, error: "invalid_units" };
  }
  if (fromUnitId === toUnitId) return { ok: false, error: "same_unit" };
  const parsedQuantity = parseQuantity(quantity);
  if (!parsedQuantity) return { ok: false, error: "invalid_quantity" };

  const outcome = await transfer(productId, { fromUnitId, toUnitId, quantity: parsedQuantity });
  if (outcome === "transferred") return { ok: true };
  return { ok: false, error: outcome === "not_found" ? "product_not_found" : outcome };
}

export type DistributeStockError = "invalid_input" | "invalid_units" | "invalid_quantity" | "distribution_exceeds_quantity";

export type DistributeStockResult =
  | { ok: true; products: { productId: string; unitQuantities: UnitQuantity[] }[] }
  | { ok: false; error: DistributeStockError };

// Troca do estoque compartilhado para o distribuído: cada unidade fica com o que foi informado
// (vazio vira zero) e a unidade padrão com o resto, inclusive dos produtos que não vieram.
export function distributeStock(
  input: unknown,
  stock: { unitIds: string[]; products: { productId: string; quantity: number }[] },
): DistributeStockResult {
  const { defaultUnitId, products } = (input ?? {}) as Record<string, unknown>;
  if (typeof defaultUnitId !== "string" || !Array.isArray(products)) return { ok: false, error: "invalid_input" };
  if (!stock.unitIds.includes(defaultUnitId)) return { ok: false, error: "invalid_units" };

  const informed = new Map<string, Map<string, number>>();
  for (const product of products) {
    const { productId, units } = (product ?? {}) as Record<string, unknown>;
    if (typeof productId !== "string" || !Array.isArray(units)) return { ok: false, error: "invalid_input" };
    if (informed.has(productId) || !stock.products.some((stocked) => stocked.productId === productId)) {
      return { ok: false, error: "invalid_input" };
    }

    const byUnit = new Map<string, number>();
    for (const unit of units) {
      const { unitId, quantity } = (unit ?? {}) as Record<string, unknown>;
      if (typeof unitId !== "string" || typeof quantity !== "string") return { ok: false, error: "invalid_input" };
      if (byUnit.has(unitId)) return { ok: false, error: "invalid_input" };
      if (!stock.unitIds.includes(unitId)) return { ok: false, error: "invalid_units" };
      const parsed = quantity.trim() ? parseQuantity(quantity) : 0;
      if (parsed === null) return { ok: false, error: "invalid_quantity" };
      byUnit.set(unitId, parsed);
    }
    informed.set(productId, byUnit);
  }

  const distributed: { productId: string; unitQuantities: UnitQuantity[] }[] = [];
  for (const { productId, quantity } of stock.products) {
    const byUnit = informed.get(productId) ?? new Map<string, number>();
    const informedTotal = [...byUnit.values()].reduce((sum, value) => sum + value, 0);
    if (informedTotal > quantity) return { ok: false, error: "distribution_exceeds_quantity" };

    const rest = quantity - informedTotal;
    distributed.push({
      productId,
      unitQuantities: stock.unitIds.map((unitId) => ({
        unitId,
        quantity: (byUnit.get(unitId) ?? 0) + (unitId === defaultUnitId ? rest : 0),
      })),
    });
  }

  return { ok: true, products: distributed };
}
