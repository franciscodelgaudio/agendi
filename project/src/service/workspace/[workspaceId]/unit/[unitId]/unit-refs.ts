import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseOpeningBalance, type OpeningBalance, type OpeningBalanceError } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import { MAX_WALLET_NAME_LENGTH } from "@/service/workspace/[workspaceId]/cash-flow/wallet";
import { MAX_INVENTORY_NAME_LENGTH } from "@/service/workspace/[workspaceId]/stock/inventory";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const NEW_REF = "new";
const NO_REF = "none";

export type WalletRef = { id: string } | { name: string; openingBalance: OpeningBalance | null };
export type InventoryRef = { id: string } | { name: string };

function refIdSchema<Invalid extends string>(invalid: Invalid) {
  return z
    .string({ error: invalid })
    .refine((id) => id === NEW_REF || id === NO_REF || OBJECT_ID.test(id), { error: invalid });
}

function nameSchema<Empty extends string, TooLong extends string>(maxLength: number, empty: Empty, tooLong: TooLong) {
  return z.string().trim().min(1, { error: empty }).max(maxLength, { error: tooLong });
}

const optionalName = z.string({ error: "invalid_input" }).nullish();

const walletRefSchema = z.object(
  { walletId: refIdSchema("invalid_wallet"), walletName: optionalName },
  { error: "invalid_input" },
);
const walletNameSchema = nameSchema(MAX_WALLET_NAME_LENGTH, "invalid_wallet_name", "wallet_name_too_long");
const inventoryRefSchema = z.object(
  { inventoryId: refIdSchema("invalid_inventory"), inventoryName: optionalName },
  { error: "invalid_input" },
);
const inventoryNameSchema = nameSchema(MAX_INVENTORY_NAME_LENGTH, "invalid_inventory_name", "inventory_name_too_long");

export type SetUnitWalletError =
  | AccessError
  | OpeningBalanceError
  | "invalid_input"
  | "invalid_wallet"
  | "invalid_wallet_name"
  | "wallet_name_too_long"
  | "unit_not_found";

export type SetUnitWalletResult = { ok: true } | { ok: false; error: SetUnitWalletError };

async function parseWalletRef(
  input: unknown,
  walletExists: (walletId: string) => Promise<boolean>,
): Promise<{ ok: true; value: WalletRef | null } | { ok: false; error: SetUnitWalletError }> {
  const parsed = walletRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<SetUnitWalletError>(parsed.error) };
  const { walletId } = parsed.data;
  if (walletId === NO_REF) return { ok: true, value: null };
  if (walletId === NEW_REF) {
    const name = walletNameSchema.safeParse(parsed.data.walletName ?? "");
    if (!name.success) return { ok: false, error: issueCode<SetUnitWalletError>(name.error) };
    const balance = parseOpeningBalance((input as Record<string, unknown>).openingBalance);
    if (!balance.ok) return balance;
    return { ok: true, value: { name: name.data, openingBalance: balance.value } };
  }
  if (!(await walletExists(walletId))) return { ok: false, error: "invalid_wallet" };
  return { ok: true, value: { id: walletId } };
}

export async function setUnitWallet(
  input: unknown,
  unitId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    walletExists: (walletId: string) => Promise<boolean>;
    update: (unitId: string, wallet: WalletRef | null) => Promise<boolean>;
  },
): Promise<SetUnitWalletResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const wallet = await parseWalletRef(input, deps.walletExists);
  if (!wallet.ok) return wallet;

  if (!(await deps.update(unitId, wallet.value))) return { ok: false, error: "unit_not_found" };
  return { ok: true };
}

export type SetUnitInventoryError =
  | AccessError
  | "invalid_input"
  | "invalid_inventory"
  | "invalid_inventory_name"
  | "inventory_name_too_long"
  | "unit_not_found";

export type SetUnitInventoryResult = { ok: true } | { ok: false; error: SetUnitInventoryError };

async function parseInventoryRef(
  input: unknown,
  inventoryExists: (inventoryId: string) => Promise<boolean>,
): Promise<{ ok: true; value: InventoryRef | null } | { ok: false; error: SetUnitInventoryError }> {
  const parsed = inventoryRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<SetUnitInventoryError>(parsed.error) };
  const { inventoryId } = parsed.data;
  if (inventoryId === NO_REF) return { ok: true, value: null };
  if (inventoryId === NEW_REF) {
    const name = inventoryNameSchema.safeParse(parsed.data.inventoryName ?? "");
    if (!name.success) return { ok: false, error: issueCode<SetUnitInventoryError>(name.error) };
    return { ok: true, value: { name: name.data } };
  }
  if (!(await inventoryExists(inventoryId))) return { ok: false, error: "invalid_inventory" };
  return { ok: true, value: { id: inventoryId } };
}

export async function setUnitInventory(
  input: unknown,
  unitId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    inventoryExists: (inventoryId: string) => Promise<boolean>;
    update: (unitId: string, inventory: InventoryRef | null) => Promise<boolean>;
  },
): Promise<SetUnitInventoryResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const inventory = await parseInventoryRef(input, deps.inventoryExists);
  if (!inventory.ok) return inventory;

  if (!(await deps.update(unitId, inventory.value))) return { ok: false, error: "unit_not_found" };
  return { ok: true };
}
