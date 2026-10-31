import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseMoneyCents } from "@/service/_shared/money";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 80;

const productSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    price: z
      .string({ error: "invalid_input" })
      .transform((value) => parseMoneyCents(value))
      .refine((cents) => cents !== null, { error: "invalid_price" }),
  },
  { error: "invalid_input" },
);

export type ProductInputError = "invalid_input" | "invalid_name" | "name_too_long" | "invalid_price";

export type ProductData = { name: string; priceCents: number };

function parseProduct(input: unknown): { ok: true; data: ProductData } | { ok: false; error: ProductInputError } {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<ProductInputError>(parsed.error) };
  return { ok: true, data: { name: parsed.data.name, priceCents: parsed.data.price! } };
}

export type CreateProductResult = { ok: true; productId: string } | { ok: false; error: AccessError | ProductInputError };

export async function createProduct(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: { insert: (data: ProductData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateProductResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseProduct(input);
  if (!parsed.ok) return parsed;

  const product = await deps.insert({ workspaceId: ctx.workspaceId, ...parsed.data });
  return { ok: true, productId: product.id };
}

export type UpdateProductError = AccessError | ProductInputError | "product_not_found";

export type UpdateProductResult = { ok: true } | { ok: false; error: UpdateProductError };

export async function updateProduct(
  input: unknown,
  productId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { update: (productId: string, data: ProductData) => Promise<boolean> },
): Promise<UpdateProductResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!productId) return { ok: false, error: "product_not_found" };

  const parsed = parseProduct(input);
  if (!parsed.ok) return parsed;

  if (!(await deps.update(productId, parsed.data))) return { ok: false, error: "product_not_found" };
  return { ok: true };
}

export type DeleteProductError = AccessError | "product_not_found" | "product_in_stock";

export type DeleteProductResult = { ok: true } | { ok: false; error: DeleteProductError };

export async function deleteProduct(
  productId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { inStock: (productId: string) => Promise<boolean>; remove: (productId: string) => Promise<boolean> },
): Promise<DeleteProductResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!productId) return { ok: false, error: "product_not_found" };

  if (await deps.inStock(productId)) return { ok: false, error: "product_in_stock" };

  if (!(await deps.remove(productId))) return { ok: false, error: "product_not_found" };
  return { ok: true };
}
