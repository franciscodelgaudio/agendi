import { isObjectIdOrHexString } from "mongoose";

const MAX_QUANTITY = 1_000_000;

// Quantidade inteira de 0 a MAX_QUANTITY, como vem do FormData; null quando inválida.
function parseQuantity(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity <= MAX_QUANTITY ? quantity : null;
}

export type TransferData = { fromUnitId: string; toUnitId: string; quantity: number };

export type TransferProductError =
  | "invalid_input"
  | "invalid_units"
  | "same_unit"
  | "invalid_quantity"
  | "product_not_found"
  | "same_stock"
  | "insufficient_stock";

export type TransferProductResult = { ok: true } | { ok: false; error: TransferProductError };

// transfer tira do estoque da origem e põe no do destino, só se a origem tiver a quantidade.
// same_stock: as duas unidades estão no mesmo estoque compartilhado.
export async function transferProduct(
  input: unknown,
  productId: string | null | undefined,
  transfer: (
    productId: string,
    data: TransferData,
  ) => Promise<"transferred" | "not_found" | "same_stock" | "invalid_units" | "insufficient_stock">,
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
