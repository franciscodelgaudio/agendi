import { isObjectIdOrHexString } from "mongoose";
import { parsePriceCents } from "@/lib/service";

const MAX_NAME_LENGTH = 80;
const MAX_NOTES_LENGTH = 500;
const MAX_QUANTITY = 1_000_000;

export type ProductInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_quantity"
  | "invalid_cost"
  | "notes_too_long"
  | "invalid_rating";

// Opcionais vazios ficam null para que editar consiga apagar o valor salvo. quantity é a do
// estoque de onde o produto foi cadastrado ou editado; o resto é do catálogo do workspace.
export type ProductData = {
  name: string;
  quantity: number;
  costCents: number;
  notes: string | null;
  rating: number | null;
  avatarUrl: string | null;
};

function parseQuantity(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return quantity <= MAX_QUANTITY ? quantity : null;
}

// Avaliação em estrelas, de 1 a 5.
function parseRating(value: string) {
  return /^[1-5]$/.test(value) ? Number(value) : null;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

export type CatalogProductData = Omit<ProductData, "quantity">;

// Valida e normaliza os campos do catálogo como chegam do FormData (strings).
function parseCatalogInput(
  input: unknown,
): ({ ok: true } & CatalogProductData) | { ok: false; error: ProductInputError } {
  const { name, cost, notes, rating, avatarUrl } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof cost !== "string") return { ok: false, error: "invalid_input" };
  if (!isOptionalString(notes) || !isOptionalString(rating) || !isOptionalString(avatarUrl)) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const costCents = parsePriceCents(cost.trim());
  if (costCents === null) return { ok: false, error: "invalid_cost" };

  const normalizedNotes = notes?.trim() || null;
  if (normalizedNotes && normalizedNotes.length > MAX_NOTES_LENGTH) return { ok: false, error: "notes_too_long" };

  const trimmedRating = rating?.trim();
  const parsedRating = trimmedRating ? parseRating(trimmedRating) : null;
  if (trimmedRating && parsedRating === null) return { ok: false, error: "invalid_rating" };

  return {
    ok: true,
    name: normalizedName,
    costCents,
    notes: normalizedNotes,
    rating: parsedRating,
    avatarUrl: avatarUrl?.trim() || null,
  };
}

// Campos do catálogo e a quantidade no estoque.
function parseProductInput(
  input: unknown,
): ({ ok: true } & ProductData) | { ok: false; error: ProductInputError } {
  const { name, quantity, cost } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof quantity !== "string" || typeof cost !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const catalog = parseCatalogInput(input);
  if (!catalog.ok) return catalog;

  const parsedQuantity = parseQuantity(quantity.trim());
  if (parsedQuantity === null) return { ok: false, error: "invalid_quantity" };

  const { name: parsedName, costCents, notes, rating, avatarUrl } = catalog;
  return { ok: true, name: parsedName, quantity: parsedQuantity, costCents, notes, rating, avatarUrl };
}

export type CreateProductError = ProductInputError | "unit_not_found";

export type CreateProductResult =
  | { ok: true; productId: string }
  | { ok: false; error: CreateProductError };

export async function createProduct(
  input: unknown,
  unitId: string | null | undefined,
  insert: (data: ProductData & { unitId: string }) => Promise<{ id: string }>,
): Promise<CreateProductResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = parseProductInput(input);
  if (!parsed.ok) return parsed;

  const { name, quantity, costCents, notes, rating, avatarUrl } = parsed;
  const product = await insert({ name, quantity, costCents, notes, rating, avatarUrl, unitId });
  return { ok: true, productId: product.id };
}

export type UpdateProductError = ProductInputError | "product_not_found";

export type UpdateProductResult = { ok: true } | { ok: false; error: UpdateProductError };

// update devolve false quando o produto não existe (ou não é da unidade).
export async function updateProduct(
  input: unknown,
  productId: string | null | undefined,
  update: (productId: string, data: ProductData) => Promise<boolean>,
): Promise<UpdateProductResult> {
  if (!productId) return { ok: false, error: "product_not_found" };

  const parsed = parseProductInput(input);
  if (!parsed.ok) return parsed;

  const { name, quantity, costCents, notes, rating, avatarUrl } = parsed;
  const found = await update(productId, { name, quantity, costCents, notes, rating, avatarUrl });
  return found ? { ok: true } : { ok: false, error: "product_not_found" };
}

export type CreateCatalogProductResult =
  | { ok: true; productId: string }
  | { ok: false; error: ProductInputError | "workspace_not_found" };

// Cadastro direto no catálogo do workspace, sem pôr em nenhum estoque.
export async function createCatalogProduct(
  input: unknown,
  workspaceId: string | null | undefined,
  insert: (data: CatalogProductData & { workspaceId: string }) => Promise<{ id: string }>,
): Promise<CreateCatalogProductResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const parsed = parseCatalogInput(input);
  if (!parsed.ok) return parsed;

  const { name, costCents, notes, rating, avatarUrl } = parsed;
  const product = await insert({ name, costCents, notes, rating, avatarUrl, workspaceId });
  return { ok: true, productId: product.id };
}

export type UpdateCatalogProductResult = { ok: true } | { ok: false; error: UpdateProductError };

// Edição no catálogo do workspace: sem quantidade, que é de cada estoque.
// update devolve false quando o produto não existe (ou não é do workspace).
export async function updateCatalogProduct(
  input: unknown,
  productId: string | null | undefined,
  update: (productId: string, data: CatalogProductData) => Promise<boolean>,
): Promise<UpdateCatalogProductResult> {
  if (!productId) return { ok: false, error: "product_not_found" };

  const parsed = parseCatalogInput(input);
  if (!parsed.ok) return parsed;

  const { name, costCents, notes, rating, avatarUrl } = parsed;
  const found = await update(productId, { name, costCents, notes, rating, avatarUrl });
  return found ? { ok: true } : { ok: false, error: "product_not_found" };
}

export type AddStockItemResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "invalid_quantity" | "product_not_found" | "already_in_stock" };

// Põe no estoque um produto do catálogo; add devolve not_found quando o produto não é do
// workspace e already_in_stock quando ele já está nesse estoque.
export async function addStockItem(
  input: unknown,
  add: (productId: string, quantity: number) => Promise<"added" | "not_found" | "already_in_stock">,
): Promise<AddStockItemResult> {
  const { productId, quantity } = (input ?? {}) as Record<string, unknown>;
  if (typeof productId !== "string" || typeof quantity !== "string") return { ok: false, error: "invalid_input" };
  if (!isObjectIdOrHexString(productId)) return { ok: false, error: "product_not_found" };

  const parsedQuantity = parseQuantity(quantity.trim());
  if (parsedQuantity === null) return { ok: false, error: "invalid_quantity" };

  const outcome = await add(productId, parsedQuantity);
  if (outcome === "added") return { ok: true };
  return { ok: false, error: outcome === "not_found" ? "product_not_found" : outcome };
}

export type DeleteProductResult = { ok: true } | { ok: false; error: "product_not_found" };

// remove devolve false quando o produto não existe (ou não é da unidade).
export async function deleteProduct(
  productId: string | null | undefined,
  remove: (productId: string) => Promise<boolean>,
): Promise<DeleteProductResult> {
  if (!productId) return { ok: false, error: "product_not_found" };

  const found = await remove(productId);
  return found ? { ok: true } : { ok: false, error: "product_not_found" };
}

export type DepleteProductResult = { ok: true } | { ok: false; error: "product_not_found" | "out_of_stock" };

// deplete registra o "acabou" e tira 1 da quantidade numa só escrita; out_of_stock quando já é zero.
export async function depleteProduct(
  productId: string | null | undefined,
  deplete: (productId: string) => Promise<"depleted" | "not_found" | "out_of_stock">,
): Promise<DepleteProductResult> {
  if (!productId) return { ok: false, error: "product_not_found" };

  const outcome = await deplete(productId);
  if (outcome === "not_found") return { ok: false, error: "product_not_found" };
  if (outcome === "out_of_stock") return { ok: false, error: "out_of_stock" };
  return { ok: true };
}
