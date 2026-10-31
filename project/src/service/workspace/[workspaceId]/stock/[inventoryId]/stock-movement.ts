import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const MOVEMENT_TYPES = ["in", "out"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

const MAX_NAME_LENGTH = 80;
const MAX_QUANTITY = 1_000_000;
const DEFAULT_NAMES: Record<MovementType, string> = { in: "Entrada", out: "Saída" };

const quantitySchema = z
  .string({ error: "invalid_input" })
  .trim()
  .refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_QUANTITY, {
    error: "invalid_quantity",
  })
  .transform(Number);

const productIdSchema = z.string({ error: "invalid_input" }).trim().min(1, { error: "invalid_input" });

const movementSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .max(MAX_NAME_LENGTH, { error: "name_too_long" })
      .nullish()
      .transform((value) => value || null),
    type: z.enum(MOVEMENT_TYPES, { error: "invalid_type" }),
    quantity: quantitySchema,
    productId: productIdSchema,
  },
  { error: "invalid_input" },
);

const transferSchema = z.object(
  {
    productId: productIdSchema,
    quantity: quantitySchema,
    toInventoryId: z.string({ error: "invalid_input" }).trim().min(1, { error: "invalid_input" }),
  },
  { error: "invalid_input" },
);

type StockLookups = {
  productExists: (productId: string) => Promise<boolean>;
  currentQuantity: (inventoryId: string, productId: string) => Promise<number | null>;
};

export type MovementData = {
  workspaceId: string;
  inventoryId: string;
  productId: string;
  name: string;
  type: MovementType;
  quantity: number;
};

export type RegisterMovementError =
  | AccessError
  | "invalid_input"
  | "invalid_type"
  | "invalid_quantity"
  | "name_too_long"
  | "product_not_found"
  | "inventory_not_found"
  | "insufficient_stock";

export type RegisterMovementResult = { ok: true } | { ok: false; error: RegisterMovementError };

export async function registerMovement(
  input: unknown,
  inventoryId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: StockLookups & { apply: (movement: MovementData) => Promise<void> },
): Promise<RegisterMovementResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<RegisterMovementError>(parsed.error) };
  const { name, type, quantity, productId } = parsed.data;
  if (!inventoryId) return { ok: false, error: "inventory_not_found" };

  if (!(await deps.productExists(productId))) return { ok: false, error: "product_not_found" };
  const current = await deps.currentQuantity(inventoryId, productId);
  if (current === null) return { ok: false, error: "inventory_not_found" };
  if (type === "out" && quantity > current) return { ok: false, error: "insufficient_stock" };

  await deps.apply({
    workspaceId: ctx.workspaceId,
    inventoryId,
    productId,
    name: name ?? DEFAULT_NAMES[type],
    type,
    quantity,
  });
  return { ok: true };
}

export type TransferData = {
  workspaceId: string;
  fromInventoryId: string;
  toInventoryId: string;
  productId: string;
  quantity: number;
};

export type TransferProductError =
  | AccessError
  | "invalid_input"
  | "invalid_quantity"
  | "product_not_found"
  | "inventory_not_found"
  | "same_inventory"
  | "insufficient_stock";

export type TransferProductResult = { ok: true } | { ok: false; error: TransferProductError };

export async function transferProduct(
  input: unknown,
  fromInventoryId: string | null | undefined,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: StockLookups & {
    inventoryExists: (inventoryId: string) => Promise<boolean>;
    applyTransfer: (transfer: TransferData) => Promise<void>;
  },
): Promise<TransferProductResult> {
  const accessError = checkAccess(ctx.actor, "stock.transfer");
  if (accessError) return { ok: false, error: accessError };

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<TransferProductError>(parsed.error) };
  const { productId, quantity, toInventoryId } = parsed.data;
  if (!fromInventoryId) return { ok: false, error: "inventory_not_found" };
  if (toInventoryId === fromInventoryId) return { ok: false, error: "same_inventory" };

  if (!(await deps.productExists(productId))) return { ok: false, error: "product_not_found" };
  const current = await deps.currentQuantity(fromInventoryId, productId);
  if (current === null || !(await deps.inventoryExists(toInventoryId))) return { ok: false, error: "inventory_not_found" };
  if (quantity > current) return { ok: false, error: "insufficient_stock" };

  await deps.applyTransfer({ workspaceId: ctx.workspaceId, fromInventoryId, toInventoryId, productId, quantity });
  return { ok: true };
}
