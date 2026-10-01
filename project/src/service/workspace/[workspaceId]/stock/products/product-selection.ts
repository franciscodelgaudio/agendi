const MAX_PRODUCTS = 20;

export type ProductSelectionError = "invalid_input" | "too_many_products" | "product_not_found";

// Cópia do nome do momento da escolha, para que mudanças futuras não alterem o histórico.
export type SelectedProduct = { productId: string; productName: string };

// Devolve só os produtos que existem na unidade.
export type FindProducts = (ids: string[]) => Promise<{ id: string; name: string }[]>;

// Valida os produtos escolhidos (getAll do FormData); ausente = nenhum.
export async function resolveProducts(
  productIds: unknown,
  findProducts: FindProducts,
): Promise<{ ok: true; products: SelectedProduct[] } | { ok: false; error: ProductSelectionError }> {
  if (productIds == null) return { ok: true, products: [] };
  if (!Array.isArray(productIds) || !productIds.every((id) => typeof id === "string")) {
    return { ok: false, error: "invalid_input" };
  }

  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length > MAX_PRODUCTS) return { ok: false, error: "too_many_products" };
  if (ids.length === 0) return { ok: true, products: [] };

  const namesById = new Map((await findProducts(ids)).map((product) => [product.id, product.name]));
  if (ids.some((id) => !namesById.has(id))) return { ok: false, error: "product_not_found" };

  return { ok: true, products: ids.map((id) => ({ productId: id, productName: namesById.get(id)! })) };
}
