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
  | ProductSelectionError;

// productIds: produtos que o serviço costuma usar, pré-marcados em agendamentos e atendimentos.
export type ServiceData = { name: string; priceCents: number; durationMinutes: number; productIds: string[] };

// "350.5" -> 35050. Feito sobre a string para não depender de arredondamento de float.
export function parsePriceCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

function parseDurationMinutes(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

// Valida e normaliza os campos como chegam do FormData (strings).
async function parseServiceInput(
  input: unknown,
  findProducts: FindProducts,
): Promise<({ ok: true } & ServiceData) | { ok: false; error: ServiceInputError }> {
  const { name, price, durationMinutes, productIds } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof price !== "string" || typeof durationMinutes !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const priceCents = parsePriceCents(price.trim());
  if (priceCents === null) return { ok: false, error: "invalid_price" };

  const minutes = parseDurationMinutes(durationMinutes.trim());
  if (minutes === null) return { ok: false, error: "invalid_duration" };

  const selection = await resolveProducts(productIds, findProducts);
  if (!selection.ok) return selection;

  return {
    ok: true,
    name: normalizedName,
    priceCents,
    durationMinutes: minutes,
    productIds: selection.products.map((product) => product.productId),
  };
}

export type CreateServiceError = ServiceInputError | "unit_not_found";

export type CreateServiceResult =
  | { ok: true; serviceId: string }
  | { ok: false; error: CreateServiceError };

export async function createService(
  input: unknown,
  unitId: string | null | undefined,
  {
    insert,
    findProducts,
  }: { insert: (data: ServiceData & { unitId: string }) => Promise<{ id: string }>; findProducts: FindProducts },
): Promise<CreateServiceResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const parsed = await parseServiceInput(input, findProducts);
  if (!parsed.ok) return parsed;

  const { name, priceCents, durationMinutes, productIds } = parsed;
  const service = await insert({ name, priceCents, durationMinutes, productIds, unitId });
  return { ok: true, serviceId: service.id };
}

export type UpdateServiceError = ServiceInputError | "service_not_found";

export type UpdateServiceResult = { ok: true } | { ok: false; error: UpdateServiceError };

// update devolve false quando o serviço não existe (ou não é da unidade).
export async function updateService(
  input: unknown,
  serviceId: string | null | undefined,
  {
    update,
    findProducts,
  }: { update: (serviceId: string, data: ServiceData) => Promise<boolean>; findProducts: FindProducts },
): Promise<UpdateServiceResult> {
  if (!serviceId) return { ok: false, error: "service_not_found" };

  const parsed = await parseServiceInput(input, findProducts);
  if (!parsed.ok) return parsed;

  const { name, priceCents, durationMinutes, productIds } = parsed;
  const found = await update(serviceId, { name, priceCents, durationMinutes, productIds });
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
