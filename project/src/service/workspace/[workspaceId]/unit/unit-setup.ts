import { parseService, type ServiceData, type ServiceInputError } from "@/service/workspace/[workspaceId]/services/service";
import { parsePartner, type PartnerData, type PartnerSaveError } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner";
import { planStations } from "@/service/workspace/[workspaceId]/unit/[unitId]/station";
import {
  parseInventoryRef,
  parseWalletRef,
  type InventoryRef,
  type SetUnitInventoryError,
  type SetUnitWalletError,
  type WalletRef,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/unit-refs";
import { parseUnitInput, type UnitData, type UnitInputError, type UnitLookups } from "@/service/workspace/[workspaceId]/unit/unit";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export type UnitSetupPlan = {
  workspaceId: string;
  wallet: WalletRef;
  inventory: InventoryRef | null;
  services: ServiceData[];
  partner: Omit<PartnerData, "unitId"> | null;
  unit: UnitData;
};

export type SetupUnitResult =
  | { ok: true; unitId: string }
  | { ok: false; error: AccessError }
  | { ok: false; step: "wallet"; error: SetUnitWalletError }
  | { ok: false; step: "inventory"; error: SetUnitInventoryError }
  | { ok: false; step: "services"; error: "no_services" }
  | { ok: false; step: "services"; error: ServiceInputError; index: number }
  | { ok: false; step: "partner"; error: PartnerSaveError }
  | { ok: false; step: "unit"; error: UnitInputError };

export async function setupUnit(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: UnitLookups & {
    walletExists: (walletId: string) => Promise<boolean>;
    inventoryExists: (inventoryId: string) => Promise<boolean>;
    save: (plan: UnitSetupPlan) => Promise<{ id: string }>;
  },
): Promise<SetupUnitResult> {
  const fields = (input ?? {}) as Record<string, unknown>;
  const withPartner = fields.partner != null;
  for (const permission of ["units.manage", "services.manage", ...(withPartner ? ["partners.manage" as const] : [])] as const) {
    const accessError = checkAccess(ctx.actor, permission);
    if (accessError) return { ok: false, error: accessError };
  }

  const wallet = await parseWalletRef(fields.wallet, deps.walletExists);
  if (!wallet.ok) return { ok: false, step: "wallet", error: wallet.error };
  if (!wallet.value) return { ok: false, step: "wallet", error: "invalid_wallet" };

  const inventory = await parseInventoryRef(fields.inventory, deps.inventoryExists);
  if (!inventory.ok) return { ok: false, step: "inventory", error: inventory.error };

  if (!Array.isArray(fields.services) || fields.services.length === 0) {
    return { ok: false, step: "services", error: "no_services" };
  }
  const services: ServiceData[] = [];
  for (const [index, serviceInput] of fields.services.entries()) {
    const service = parseService(serviceInput);
    if (!service.ok) return { ok: false, step: "services", error: service.error, index };
    services.push(service.data);
  }

  let partner: UnitSetupPlan["partner"] = null;
  if (withPartner) {
    const parsed = await parsePartner({ ...(fields.partner as object), unitId: null }, async () => false);
    if (!parsed.ok) return { ok: false, step: "partner", error: parsed.error };
    partner = { name: parsed.data.name, thresholdRule: parsed.data.thresholdRule, tiers: parsed.data.tiers };
  }

  const unit = await parseUnitInput(fields.unit, deps);
  if (!unit.ok) return { ok: false, step: "unit", error: unit.error };

  const saved = await deps.save({
    workspaceId: ctx.workspaceId,
    wallet: wallet.value,
    inventory: inventory.value,
    services,
    partner,
    unit: { ...unit.data, stations: planStations([], unit.data.stations) },
  });
  return { ok: true, unitId: saved.id };
}
