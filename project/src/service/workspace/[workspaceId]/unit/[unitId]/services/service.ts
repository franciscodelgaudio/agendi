import { resolveProducts, type FindProducts, type ProductSelectionError } from "@/service/workspace/[workspaceId]/stock/products/product-selection";

const MAX_NAME_LENGTH = 80;
const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00
const MAX_DURATION_MINUTES = 1440; // 24h

export type ServiceInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_price"
  | "invalid_duration"
  | "treatment_room_not_found"
  | ProductSelectionError;

// Espaços da unidade entre os ids pedidos; os que não existem nela ficam de fora.
export type FindTreatmentRooms = (ids: string[]) => Promise<{ id: string }[]>;

// productIds: produtos que o serviço costuma usar, pré-marcados em agendamentos e atendimentos.
// requiresTherapist false: serviço sem profissional (ex.: hidromassagem), sem comissão.
// treatmentRoomIds: espaços em que o serviço pode ser feito; vazio aceita qualquer um.
export type ServiceData = {
  name: string;
  priceCents: number;
  durationMinutes: number;
  productIds: string[];
  requiresTherapist: boolean;
  treatmentRoomIds: string[];
};

type Lookups = { findProducts: FindProducts; findTreatmentRooms: FindTreatmentRooms };

// "350.5" -> 35050. Feito sobre a string para não depender de arredondamento de float.
export function parsePriceCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

function isNonEmptyStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim());
}

function parseDurationMinutes(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

// Valida e normaliza os campos como chegam do FormData (strings).
async function parseServiceInput(
  input: unknown,
  { findProducts, findTreatmentRooms }: Lookups,
): Promise<{ ok: true; data: ServiceData } | { ok: false; error: ServiceInputError }> {
  const { name, price, durationMinutes, productIds, requiresTherapist, treatmentRoomIds } = (input ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof name !== "string" || typeof price !== "string" || typeof durationMinutes !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  // Sem o campo, o serviço exige profissional.
  if (requiresTherapist !== undefined && requiresTherapist !== "true" && requiresTherapist !== "false") {
    return { ok: false, error: "invalid_input" };
  }
  if (treatmentRoomIds !== undefined && !isNonEmptyStringList(treatmentRoomIds)) {
    return { ok: false, error: "invalid_input" };
  }
  const roomIds = [...new Set((treatmentRoomIds ?? []).map((id) => id.trim()))];

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const priceCents = parsePriceCents(price.trim());
  if (priceCents === null) return { ok: false, error: "invalid_price" };

  const minutes = parseDurationMinutes(durationMinutes.trim());
  if (minutes === null) return { ok: false, error: "invalid_duration" };

  const selection = await resolveProducts(productIds, findProducts);
  if (!selection.ok) return selection;

  if (roomIds.length) {
    const found = new Set((await findTreatmentRooms(roomIds)).map((room) => room.id));
    if (roomIds.some((id) => !found.has(id))) return { ok: false, error: "treatment_room_not_found" };
  }

  return {
    ok: true,
    data: {
      name: normalizedName,
      priceCents,
      durationMinutes: minutes,
      productIds: selection.products.map((product) => product.productId),
      requiresTherapist: requiresTherapist !== "false",
      treatmentRoomIds: roomIds,
    },
  };
}

export type CreateServiceError = ServiceInputError | "unit_not_found";

export type CreateServiceResult =
  | { ok: true; serviceId: string }
  | { ok: false; error: CreateServiceError };

export async function createService(
  input: unknown,
  unitId: string | null | undefined,
  { insert, ...lookups }: Lookups & { insert: (data: ServiceData & { unitId: string }) => Promise<{ id: string }> },
): Promise<CreateServiceResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = await parseServiceInput(input, lookups);
  if (!parsed.ok) return parsed;

  const service = await insert({ ...parsed.data, unitId });
  return { ok: true, serviceId: service.id };
}

export type UpdateServiceError = ServiceInputError | "service_not_found";

export type UpdateServiceResult = { ok: true } | { ok: false; error: UpdateServiceError };

// update devolve false quando o serviço não existe (ou não é da unidade).
export async function updateService(
  input: unknown,
  serviceId: string | null | undefined,
  { update, ...lookups }: Lookups & { update: (serviceId: string, data: ServiceData) => Promise<boolean> },
): Promise<UpdateServiceResult> {
  if (!serviceId) return { ok: false, error: "service_not_found" };

  const parsed = await parseServiceInput(input, lookups);
  if (!parsed.ok) return parsed;

  const found = await update(serviceId, parsed.data);
  return found ? { ok: true } : { ok: false, error: "service_not_found" };
}

export type DeleteServiceResult = { ok: true } | { ok: false; error: "service_not_found" };

// remove devolve false quando o serviço não existe (ou não é da unidade).
export async function deleteService(
  serviceId: string | null | undefined,
  remove: (serviceId: string) => Promise<boolean>,
): Promise<DeleteServiceResult> {
  if (!serviceId) return { ok: false, error: "service_not_found" };

  const found = await remove(serviceId);
  return found ? { ok: true } : { ok: false, error: "service_not_found" };
}
