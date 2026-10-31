import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseBusinessHours, type BusinessHours, type BusinessHoursError } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours";
import { parseOpeningBalance, type OpeningBalance, type OpeningBalanceError } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import { parseStations, type StationError, type StationInput } from "@/service/workspace/[workspaceId]/unit/[unitId]/station";
import { MAX_INVENTORY_NAME_LENGTH } from "@/service/workspace/[workspaceId]/stock/inventory";
import { MAX_WALLET_NAME_LENGTH } from "@/service/workspace/[workspaceId]/cash-flow/wallet";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 80;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const unitSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    imageUrl: z
      .string({ error: "invalid_input" })
      .trim()
      .nullish()
      .transform((value) => value || null)
      .refine((value) => value === null || isHttpUrl(value), { error: "invalid_image_url" }),
    workspaceMemberIds: z
      .array(z.string({ error: "invalid_members" }).trim(), { error: "invalid_input" })
      .refine((ids) => ids.every((id) => OBJECT_ID.test(id)), { error: "invalid_members" })
      .transform((ids) => [...new Set(ids)]),
  },
  { error: "invalid_input" },
);

export type UnitInputError =
  | OpeningBalanceError
  | "invalid_wallet"
  | "invalid_wallet_name"
  | "wallet_name_too_long"
  | "invalid_inventory"
  | "invalid_inventory_name"
  | "inventory_name_too_long"
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_image_url"
  | "invalid_members"
  | StationError
  | BusinessHoursError;

export type WalletRef = { id: string } | { name: string; openingBalance: OpeningBalance | null };
export type InventoryRef = { id: string } | { name: string };

export type UnitData = {
  name: string;
  imageUrl: string | null;
  stations: StationInput[];
  businessHours: BusinessHours;
  workspaceMemberIds: string[];
  wallet: WalletRef;
  inventory: InventoryRef;
};

type UnitLookups = {
  membersExist: (ids: string[]) => Promise<boolean>;
  walletExists: (walletId: string) => Promise<boolean>;
  inventoryExists: (inventoryId: string) => Promise<boolean>;
};

const NEW_REF = "new";

function newName(value: unknown, maxLength: number) {
  if (value != null && typeof value !== "string") return "invalid" as const;
  const name = value?.trim() ?? "";
  if (!name) return "empty" as const;
  return name.length > maxLength ? ("too_long" as const) : name;
}

async function parseWallet(
  fields: Record<string, unknown>,
  walletExists: UnitLookups["walletExists"],
): Promise<{ ok: true; value: WalletRef } | { ok: false; error: UnitInputError }> {
  const { walletId, walletName, openingBalance } = fields;
  if (walletId === NEW_REF) {
    const name = newName(walletName, MAX_WALLET_NAME_LENGTH);
    if (name === "invalid") return { ok: false, error: "invalid_input" };
    if (name === "empty") return { ok: false, error: "invalid_wallet_name" };
    if (name === "too_long") return { ok: false, error: "wallet_name_too_long" };
    const balance = parseOpeningBalance(openingBalance);
    if (!balance.ok) return balance;
    return { ok: true, value: { name, openingBalance: balance.value } };
  }
  if (typeof walletId !== "string" || !OBJECT_ID.test(walletId) || !(await walletExists(walletId))) {
    return { ok: false, error: "invalid_wallet" };
  }
  return { ok: true, value: { id: walletId } };
}

async function parseInventory(
  fields: Record<string, unknown>,
  inventoryExists: UnitLookups["inventoryExists"],
): Promise<{ ok: true; value: InventoryRef } | { ok: false; error: UnitInputError }> {
  const { inventoryId, inventoryName } = fields;
  if (inventoryId === NEW_REF) {
    const name = newName(inventoryName, MAX_INVENTORY_NAME_LENGTH);
    if (name === "invalid") return { ok: false, error: "invalid_input" };
    if (name === "empty") return { ok: false, error: "invalid_inventory_name" };
    if (name === "too_long") return { ok: false, error: "inventory_name_too_long" };
    return { ok: true, value: { name } };
  }
  if (typeof inventoryId !== "string" || !OBJECT_ID.test(inventoryId) || !(await inventoryExists(inventoryId))) {
    return { ok: false, error: "invalid_inventory" };
  }
  return { ok: true, value: { id: inventoryId } };
}

async function parseUnitInput(
  input: unknown,
  { membersExist, walletExists, inventoryExists }: UnitLookups,
): Promise<{ ok: true; data: UnitData } | { ok: false; error: UnitInputError }> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<UnitInputError>(parsed.error) };
  const fields = input as Record<string, unknown>;
  const { stations: stationsInput, businessHours: hoursInput } = fields;

  const stations = parseStations(stationsInput);
  if (!stations.ok) return stations;
  const hours = parseBusinessHours(hoursInput);
  if (!hours.ok) return hours;

  const { workspaceMemberIds } = parsed.data;
  if (workspaceMemberIds.length && !(await membersExist(workspaceMemberIds))) return { ok: false, error: "invalid_members" };

  const wallet = await parseWallet(fields, walletExists);
  if (!wallet.ok) return wallet;
  const inventory = await parseInventory(fields, inventoryExists);
  if (!inventory.ok) return inventory;

  return {
    ok: true,
    data: {
      ...parsed.data,
      stations: stations.value,
      businessHours: hours.value,
      workspaceMemberIds,
      wallet: wallet.value,
      inventory: inventory.value,
    },
  };
}

export type CreateUnitError = AccessError | UnitInputError;

export type CreateUnitResult = { ok: true; unitId: string } | { ok: false; error: CreateUnitError };

export async function createUnit(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: UnitLookups & { insert: (data: UnitData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateUnitResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = await parseUnitInput(input, deps);
  if (!parsed.ok) return parsed;

  const unit = await deps.insert({ workspaceId: ctx.workspaceId, ...parsed.data });
  return { ok: true, unitId: unit.id };
}

export type UpdateUnitError = AccessError | UnitInputError | "station_in_use" | "unit_not_found";

export type UpdateUnitResult = { ok: true } | { ok: false; error: UpdateUnitError };

export async function updateUnit(
  input: unknown,
  unitId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: UnitLookups & {
    hasBookingsInRemovedStations: (unitId: string, keptStationIds: string[]) => Promise<boolean>;
    update: (unitId: string, data: UnitData) => Promise<boolean>;
  },
): Promise<UpdateUnitResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = await parseUnitInput(input, deps);
  if (!parsed.ok) return parsed;

  const keptStationIds = parsed.data.stations.flatMap((station) => (station.id ? [station.id] : []));
  if (await deps.hasBookingsInRemovedStations(unitId, keptStationIds)) return { ok: false, error: "station_in_use" };

  if (!(await deps.update(unitId, parsed.data))) return { ok: false, error: "unit_not_found" };
  return { ok: true };
}

export type DeleteUnitResult = { ok: true } | { ok: false; error: AccessError | "unit_not_found" };

export async function deleteUnit(
  unitId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { remove: (unitId: string) => Promise<boolean> },
): Promise<DeleteUnitResult> {
  const accessError = checkAccess(ctx.actor, "units.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!unitId) return { ok: false, error: "unit_not_found" };

  if (!(await deps.remove(unitId))) return { ok: false, error: "unit_not_found" };
  return { ok: true };
}
