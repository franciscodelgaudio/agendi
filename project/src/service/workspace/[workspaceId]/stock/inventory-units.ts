import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const MAX_UNITS = 200;

const inventoryUnitsSchema = z.object(
  {
    unitIds: z
      .array(z.string({ error: "invalid_unit" }).regex(OBJECT_ID, { error: "invalid_unit" }), { error: "invalid_input" })
      .max(MAX_UNITS, { error: "invalid_input" }),
  },
  { error: "invalid_input" },
);

export type SetInventoryUnitsError = AccessError | "invalid_input" | "invalid_unit" | "inventory_not_found";

export type SetInventoryUnitsResult = { ok: true } | { ok: false; error: SetInventoryUnitsError };

export async function setInventoryUnits(
  input: unknown,
  inventoryId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    unitsExist: (unitIds: string[]) => Promise<boolean>;
    update: (inventoryId: string, unitIds: string[]) => Promise<boolean>;
  },
): Promise<SetInventoryUnitsResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!inventoryId) return { ok: false, error: "inventory_not_found" };

  const parsed = inventoryUnitsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<SetInventoryUnitsError>(parsed.error) };
  const unitIds = [...new Set(parsed.data.unitIds)];

  if (unitIds.length > 0 && !(await deps.unitsExist(unitIds))) return { ok: false, error: "invalid_unit" };

  if (!(await deps.update(inventoryId, unitIds))) return { ok: false, error: "inventory_not_found" };
  return { ok: true };
}
