import { parseBusinessHours, type BusinessHours, type BusinessHoursError } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours";
import { parseOpeningBalance, type OpeningBalance, type OpeningBalanceError } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import { parseRevenueShare, type RevenueShare, type RevenueShareError } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { parseTreatmentRooms, type TreatmentRoomError, type TreatmentRoomInput } from "@/service/workspace/[workspaceId]/unit/[unitId]/treatment-room";

const MAX_NAME_LENGTH = 80;

export type CreateUnitError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_avatar_url"
  | "invalid_ownership"
  | RevenueShareError
  | TreatmentRoomError
  | BusinessHoursError
  | OpeningBalanceError
  | "workspace_not_found";

export type CreateUnitResult =
  | { ok: true; unitId: string }
  | { ok: false; error: CreateUnitError };

export function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// O saldo inicial só é informado na criação; depois ele é editado no Caixa.
type UnitInputError = Exclude<CreateUnitError, "workspace_not_found" | Exclude<OpeningBalanceError, "invalid_input">>;

// revenueShare é null quando a unidade funciona em espaço próprio.
type UnitInput = {
  name: string;
  avatarUrl: string | null;
  revenueShare: RevenueShare | null;
  treatmentRooms: TreatmentRoomInput[];
  businessHours: BusinessHours;
};

// Valida e normaliza nome, avatarUrl, regra de repasse, salas e horário; avatarUrl vazia vira null.
// A regra só é lida quando a unidade funciona dentro de um estabelecimento parceiro.
function parseUnitInput(input: unknown): ({ ok: true } & UnitInput) | { ok: false; error: UnitInputError } {
  const { name, avatarUrl, ownership, revenueShare, treatmentRooms, businessHours } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  if (avatarUrl != null && typeof avatarUrl !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const normalizedAvatarUrl = avatarUrl?.trim() || null;
  if (normalizedAvatarUrl && !isHttpUrl(normalizedAvatarUrl)) {
    return { ok: false, error: "invalid_avatar_url" };
  }

  if (ownership !== "own" && ownership !== "partner") return { ok: false, error: "invalid_ownership" };

  let share: RevenueShare | null = null;
  if (ownership === "partner") {
    const parsed = parseRevenueShare(revenueShare);
    if (!parsed.ok) return parsed;
    share = parsed.value;
  }

  const rooms = parseTreatmentRooms(treatmentRooms);
  if (!rooms.ok) return rooms;

  const hours = parseBusinessHours(businessHours);
  if (!hours.ok) return hours;

  return {
    ok: true,
    name: normalizedName,
    avatarUrl: normalizedAvatarUrl,
    revenueShare: share,
    treatmentRooms: rooms.value,
    businessHours: hours.value,
  };
}

export async function createUnit(
  input: unknown,
  workspaceId: string | null | undefined,
  insert: (data: {
    name: string;
    avatarUrl?: string;
    revenueShare?: RevenueShare;
    treatmentRooms: TreatmentRoomInput[];
    businessHours: BusinessHours;
    openingBalance?: OpeningBalance;
    workspaceId: string;
  }) => Promise<{ id: string }>,
): Promise<CreateUnitResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const parsed = parseUnitInput(input);
  if (!parsed.ok) return parsed;
  const balance = parseOpeningBalance((input as Record<string, unknown>).openingBalance);
  if (!balance.ok) return balance;

  const unit = await insert({
    name: parsed.name,
    ...(parsed.avatarUrl && { avatarUrl: parsed.avatarUrl }),
    ...(parsed.revenueShare && { revenueShare: parsed.revenueShare }),
    treatmentRooms: parsed.treatmentRooms,
    businessHours: parsed.businessHours,
    ...(balance.value && { openingBalance: balance.value }),
    workspaceId,
  });
  return { ok: true, unitId: unit.id };
}

export type UpdateUnitError = UnitInputError | "treatment_room_in_use" | "unit_not_found";

export type UpdateUnitResult = { ok: true } | { ok: false; error: UpdateUnitError };

// update devolve false quando a unidade não existe (ou não é do workspace).
// hasBookingsInRemovedRooms: true quando alguma sala fora de keptRoomIds ainda tem agendamento por terminar.
export async function updateUnit(
  input: unknown,
  unitId: string | null | undefined,
  update: (unitId: string, data: UnitInput) => Promise<boolean>,
  hasBookingsInRemovedRooms: (unitId: string, keptRoomIds: string[]) => Promise<boolean>,
): Promise<UpdateUnitResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = parseUnitInput(input);
  if (!parsed.ok) return parsed;

  const { name, avatarUrl, revenueShare, treatmentRooms, businessHours } = parsed;
  const keptRoomIds = treatmentRooms.flatMap((room) => (room.id ? [room.id] : []));
  if (await hasBookingsInRemovedRooms(unitId, keptRoomIds)) return { ok: false, error: "treatment_room_in_use" };

  const found = await update(unitId, { name, avatarUrl, revenueShare, treatmentRooms, businessHours });
  return found ? { ok: true } : { ok: false, error: "unit_not_found" };
}

export type DeleteUnitResult = { ok: true } | { ok: false; error: "unit_not_found" };

// remove devolve false quando a unidade não existe (ou não é do workspace).
export async function deleteUnit(
  unitId: string | null | undefined,
  remove: (unitId: string) => Promise<boolean>,
): Promise<DeleteUnitResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const found = await remove(unitId);
  return found ? { ok: true } : { ok: false, error: "unit_not_found" };
}
