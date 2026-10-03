import { BRT_OFFSET_HOURS, parseDay } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list";
import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";
import {
  resolveProducts,
  type FindProducts,
  type ProductSelectionError,
  type SelectedProduct,
} from "@/service/workspace/[workspaceId]/stock/products/product-selection";

const MAX_GUEST_NAME_LENGTH = 80;
const MAX_ROOM_LENGTH = 20;
const MAX_ITEMS = 20;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 12 * 60;
const MAX_DISCOUNT_REASON_LENGTH = 120;

export type CreateAppointmentError =
  | "invalid_input"
  | "invalid_guest_name"
  | "guest_name_too_long"
  | "invalid_room"
  | "room_too_long"
  | "invalid_performed_at"
  | "no_items"
  | "too_many_items"
  | "invalid_item"
  | "invalid_duration"
  | "service_not_found"
  | "therapist_not_found"
  | "invalid_discount"
  | "discount_reason_too_long"
  | "discount_exceeds_total"
  | "unit_not_found"
  | ProductSelectionError;

export type CreateAppointmentResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: CreateAppointmentError };

type AppointmentItem = {
  serviceId: string;
  serviceName: string;
  priceCents: number;
  durationMinutes: number;
  // null quando o serviço não usa profissional (e, portanto, não gera comissão).
  therapistId: string | null;
  therapistName: string | null;
};

// Desconto no total do atendimento; cents é o valor descontado, já rateado nos itens.
export type AppointmentDiscount =
  | { type: "percent"; percent: number; cents: number; reason: string }
  | { type: "amount"; cents: number; reason: string };

// Dados editáveis de um atendimento (tudo menos a unidade). Sem desconto, discount fica ausente.
export type AppointmentFields = {
  performedAt: Date;
  guest: { name: string; room: string };
  items: AppointmentItem[];
  products: SelectedProduct[];
  discount?: AppointmentDiscount;
};

export type AppointmentData = AppointmentFields & { unitId: string };

type Lookups = {
  // Devolvem só os que existem: serviços da unidade e quem pode atender no workspace.
  findServices: (
    ids: string[],
  ) => Promise<{ id: string; name: string; priceCents: number; durationMinutes: number; requiresTherapist: boolean }[]>;
  findTherapists: (ids: string[]) => Promise<{ id: string; name: string }[]>;
  findProducts: FindProducts;
};

type FieldsError = Exclude<CreateAppointmentError, "unit_not_found">;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// "2026-09-24T14:30" no horário de Brasília -> Date em UTC; null se inválido.
export function parsePerformedAt(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  const day = match && parseDay(match[1]);
  if (!day) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  const [year, month, date] = day;
  return new Date(Date.UTC(year, month - 1, date, hours + BRT_OFFSET_HOURS, minutes));
}

type DiscountInput = ({ type: "percent"; hundredths: number } | { type: "amount"; cents: number }) & { reason: string };

// Campos de desconto como chegam do FormData. Sem tipo, não há desconto (o motivo é ignorado).
function parseDiscount(
  type: unknown,
  value: unknown,
  reason: unknown,
): { ok: true; discount: DiscountInput | null } | { ok: false; error: FieldsError } {
  if (type === undefined || type === "") return { ok: true, discount: null };
  if (typeof type !== "string" || typeof value !== "string" || (reason !== undefined && typeof reason !== "string")) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedReason = (reason ?? "").trim();
  const trimmed = value.trim();
  let discount: DiscountInput | null = null;
  if (type === "percent") {
    // Até 2 casas, em centésimos de ponto percentual para não depender de float.
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
    const hundredths = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : 0;
    if (hundredths > 0 && hundredths <= 10000) discount = { type, hundredths, reason: normalizedReason };
  } else if (type === "amount") {
    const cents = parsePriceCents(trimmed);
    if (cents) discount = { type, cents, reason: normalizedReason };
  }
  if (!discount) return { ok: false, error: "invalid_discount" };
  if (normalizedReason.length > MAX_DISCOUNT_REASON_LENGTH) return { ok: false, error: "discount_reason_too_long" };
  return { ok: true, discount };
}

// Rateia o desconto proporcionalmente aos valores; os centavos que sobram vão pelo maior resto
// (empate: o item que vem antes).
function allocateDiscount(prices: number[], discountCents: number) {
  const total = prices.reduce((sum, price) => sum + price, 0);
  if (total === 0) return prices;
  const shares = prices.map((price) => Math.floor((discountCents * price) / total));
  const remainders = prices.map((price, i) => ({ i, remainder: (discountCents * price) % total }));
  let leftover = discountCents - shares.reduce((sum, share) => sum + share, 0);
  remainders.sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of remainders) {
    if (leftover === 0) break;
    shares[i] += 1;
    leftover -= 1;
  }
  return prices.map((price, i) => price - shares[i]);
}

// Valida o input do formulário e resolve serviços e profissionais, copiando nome, valor e
// duração para que mudanças futuras no serviço não alterem o histórico. A duração de cada
// serviço pode vir no input; vazia (ou sem a lista), vale a do cadastro.
async function resolveAppointmentFields(
  input: unknown,
  { findServices, findTherapists, findProducts }: Lookups,
): Promise<{ ok: true; fields: AppointmentFields } | { ok: false; error: FieldsError }> {
  const {
    guestName,
    room,
    performedAt,
    serviceIds,
    therapistIds,
    durations,
    productIds,
    discountType,
    discountValue,
    discountReason,
  } = (input ?? {}) as Record<string, unknown>;
  if (
    typeof guestName !== "string" ||
    typeof room !== "string" ||
    typeof performedAt !== "string" ||
    !isStringList(serviceIds) ||
    !isStringList(therapistIds) ||
    (durations !== undefined && !isStringList(durations))
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const name = guestName.trim();
  if (!name) return { ok: false, error: "invalid_guest_name" };
  if (name.length > MAX_GUEST_NAME_LENGTH) return { ok: false, error: "guest_name_too_long" };

  const normalizedRoom = room.trim();
  if (!normalizedRoom) return { ok: false, error: "invalid_room" };
  if (normalizedRoom.length > MAX_ROOM_LENGTH) return { ok: false, error: "room_too_long" };

  const date = parsePerformedAt(performedAt.trim());
  if (!date) return { ok: false, error: "invalid_performed_at" };

  // Os pares serviço/profissional chegam em duas listas paralelas, na ordem das linhas do formulário.
  if (serviceIds.length !== therapistIds.length) return { ok: false, error: "invalid_item" };
  if (serviceIds.length === 0) return { ok: false, error: "no_items" };
  if (serviceIds.length > MAX_ITEMS) return { ok: false, error: "too_many_items" };
  const pairs = serviceIds.map((serviceId, i) => ({ serviceId: serviceId.trim(), therapistId: therapistIds[i].trim() }));
  if (pairs.some((pair) => !pair.serviceId)) return { ok: false, error: "invalid_item" };

  // null = usar a duração do cadastro do serviço.
  if (durations && durations.length !== pairs.length) return { ok: false, error: "invalid_item" };
  const durationList = pairs.map((_, i) => durations?.[i].trim() || null);
  if (
    durationList.some(
      (value) =>
        value !== null &&
        (!/^\d+$/.test(value) || Number(value) < MIN_DURATION_MINUTES || Number(value) > MAX_DURATION_MINUTES),
    )
  ) {
    return { ok: false, error: "invalid_duration" };
  }

  const parsedDiscount = parseDiscount(discountType, discountValue, discountReason);
  if (!parsedDiscount.ok) return parsedDiscount;

  const [services, selection] = await Promise.all([
    findServices([...new Set(pairs.map((pair) => pair.serviceId))]),
    resolveProducts(productIds, findProducts),
  ]);
  const servicesById = new Map(services.map((service) => [service.id, service]));
  if (pairs.some((pair) => !servicesById.has(pair.serviceId))) return { ok: false, error: "service_not_found" };

  // Só os serviços que usam profissional precisam de um; nos outros, o informado é descartado.
  const therapistIdList = pairs.map(({ serviceId, therapistId }) =>
    servicesById.get(serviceId)!.requiresTherapist ? therapistId : null,
  );
  if (therapistIdList.some((therapistId) => therapistId === "")) return { ok: false, error: "invalid_item" };
  const neededTherapistIds = [...new Set(therapistIdList.filter((id): id is string => id !== null))];
  const therapists = neededTherapistIds.length ? await findTherapists(neededTherapistIds) : [];
  const therapistsById = new Map(therapists.map((therapist) => [therapist.id, therapist]));
  if (neededTherapistIds.some((id) => !therapistsById.has(id))) return { ok: false, error: "therapist_not_found" };
  if (!selection.ok) return selection;

  const items = pairs.map(({ serviceId }, i) => {
    const service = servicesById.get(serviceId)!;
    const therapistId = therapistIdList[i];
    return {
      serviceId,
      serviceName: service.name,
      priceCents: service.priceCents,
      durationMinutes: durationList[i] === null ? service.durationMinutes : Number(durationList[i]),
      therapistId,
      therapistName: therapistId === null ? null : therapistsById.get(therapistId)!.name,
    };
  });
  const fields: AppointmentFields = { performedAt: date, guest: { name, room: normalizedRoom }, items, products: selection.products };

  const discount = parsedDiscount.discount;
  if (discount) {
    const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
    const cents = discount.type === "percent" ? Math.round((totalCents * discount.hundredths) / 10000) : discount.cents;
    if (cents > totalCents) return { ok: false, error: "discount_exceeds_total" };
    const prices = allocateDiscount(items.map((item) => item.priceCents), cents);
    items.forEach((item, i) => (item.priceCents = prices[i]));
    fields.discount =
      discount.type === "percent"
        ? { type: "percent", percent: discount.hundredths / 100, cents, reason: discount.reason }
        : { type: "amount", cents, reason: discount.reason };
  }

  return { ok: true, fields };
}

export async function createAppointment(
  input: unknown,
  unitId: string | null | undefined,
  { insert, ...lookups }: Lookups & { insert: (data: AppointmentData) => Promise<{ id: string }> },
): Promise<CreateAppointmentResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const resolved = await resolveAppointmentFields(input, lookups);
  if (!resolved.ok) return resolved;

  const appointment = await insert({ unitId, ...resolved.fields });
  return { ok: true, appointmentId: appointment.id };
}

export type UpdateAppointmentError = FieldsError | "appointment_not_found";

export type UpdateAppointmentResult = { ok: true } | { ok: false; error: UpdateAppointmentError };

// update devolve false quando o atendimento não existe (ou não é da unidade).
// Os dados do serviço são copiados de novo do cadastro atual, como no registro.
export async function updateAppointment(
  input: unknown,
  appointmentId: string | null | undefined,
  { update, ...lookups }: Lookups & { update: (appointmentId: string, fields: AppointmentFields) => Promise<boolean> },
): Promise<UpdateAppointmentResult> {
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  const resolved = await resolveAppointmentFields(input, lookups);
  if (!resolved.ok) return resolved;

  const found = await update(appointmentId, resolved.fields);
  return found ? { ok: true } : { ok: false, error: "appointment_not_found" };
}

export type DeleteAppointmentResult = { ok: true } | { ok: false; error: "appointment_not_found" };

// remove devolve false quando o atendimento não existe (ou não é da unidade).
export async function deleteAppointment(
  appointmentId: string | null | undefined,
  remove: (appointmentId: string) => Promise<boolean>,
): Promise<DeleteAppointmentResult> {
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  const found = await remove(appointmentId);
  return found ? { ok: true } : { ok: false, error: "appointment_not_found" };
}
