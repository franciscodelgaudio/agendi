import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const MAX_INVENTORY_NAME_LENGTH = 40;

const inventorySchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_INVENTORY_NAME_LENGTH, { error: "name_too_long" }),
  },
  { error: "invalid_input" },
);

export type InventoryInputError = "invalid_input" | "invalid_name" | "name_too_long";

export type CreateInventoryResult =
  | { ok: true; inventoryId: string }
  | { ok: false; error: AccessError | InventoryInputError };

export async function createInventory(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: { insert: (data: { workspaceId: string; name: string }) => Promise<{ id: string }> },
): Promise<CreateInventoryResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = inventorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<InventoryInputError>(parsed.error) };

  const inventory = await deps.insert({ workspaceId: ctx.workspaceId, name: parsed.data.name });
  return { ok: true, inventoryId: inventory.id };
}

export type UpdateInventoryError = AccessError | InventoryInputError | "inventory_not_found";

export type UpdateInventoryResult = { ok: true } | { ok: false; error: UpdateInventoryError };

export async function updateInventory(
  input: unknown,
  inventoryId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { update: (inventoryId: string, data: { name: string }) => Promise<boolean> },
): Promise<UpdateInventoryResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!inventoryId) return { ok: false, error: "inventory_not_found" };

  const parsed = inventorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<InventoryInputError>(parsed.error) };

  if (!(await deps.update(inventoryId, parsed.data))) return { ok: false, error: "inventory_not_found" };
  return { ok: true };
}

export type DeleteInventoryError = AccessError | "inventory_not_found" | "inventory_in_use";

export type DeleteInventoryResult = { ok: true } | { ok: false; error: DeleteInventoryError };

export async function deleteInventory(
  inventoryId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { hasUnits: (inventoryId: string) => Promise<boolean>; remove: (inventoryId: string) => Promise<boolean> },
): Promise<DeleteInventoryResult> {
  const accessError = checkAccess(ctx.actor, "stock.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!inventoryId) return { ok: false, error: "inventory_not_found" };

  if (await deps.hasUnits(inventoryId)) return { ok: false, error: "inventory_in_use" };

  if (!(await deps.remove(inventoryId))) return { ok: false, error: "inventory_not_found" };
  return { ok: true };
}
