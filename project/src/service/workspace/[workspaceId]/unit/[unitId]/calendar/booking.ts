import { parsePerformedAt } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment";
import { isBookingColor } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors";
import {
  resolveProducts,
  type FindProducts,
  type ProductSelectionError,
  type SelectedProduct,
} from "@/service/workspace/[workspaceId]/stock/products/product-selection";

const MAX_GUEST_NAME_LENGTH = 80;
const MAX_ROOM_LENGTH = 20;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 12 * 60;
const MINUTE_MS = 60 * 1000;

export type BookingError =
  | "invalid_input"
  | "invalid_therapist"
  | "invalid_service"
  | "invalid_station"
  | "invalid_guest_name"
  | "guest_name_too_long"
  | "invalid_room"
  | "room_too_long"
  | "invalid_starts_at"
  | "invalid_duration"
  | "invalid_color"
  | "service_not_found"
  | "therapist_not_found"
  | "therapist_busy"
  | "therapist_unavailable"
  | "station_not_found"
  | "station_not_allowed"
  | "station_inactive"
  | "station_busy"
  | "unit_not_found"
  | "booking_not_found"
  | "booking_registered"
  | "duration_locked"
  | ProductSelectionError;

// Dados editáveis de um agendamento (tudo menos a unidade). Os nomes do profissional e do
// serviço são cópias do momento do agendamento. Sem profissional (serviço que não usa), ambos null.
export type BookingFields = {
  therapistId: string | null;
  therapistName: string | null;
  guest: { name: string; room: string };
  startsAt: Date;
  endsAt: Date;
  service: { serviceId: string; serviceName: string };
  // Estação da unidade, com cópia do nome do momento do agendamento.
  station: { stationId: string; stationName: string };
  products: SelectedProduct[];
  // Cor no calendário; null usa a do profissional.
  color: string | null;
};

export type BookingData = BookingFields & { unitId: string };

type Interval = { therapistId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type BlockInterval = { therapistId: string; startsAt: Date; endsAt: Date };
type StationInterval = { stationId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type FindStationBookings = (interval: StationInterval) => Promise<readonly { startsAt: Date; endsAt: Date }[]>;

type Lookups = {
  // Devolvem null quando não existe: serviço da unidade e quem pode atender no workspace.
  // stationIds vazio: o serviço pode usar qualquer estação da unidade.
  findService: (
    id: string,
  ) => Promise<{ id: string; name: string; requiresTherapist: boolean; stationIds: string[] } | null>;
  findTherapist: (id: string) => Promise<{ id: string; name: string } | null>;
  // true quando o profissional já tem outro agendamento que se sobrepõe ao intervalo.
  hasConflict: (interval: Interval) => Promise<boolean>;
  // true quando a agenda do profissional está travada em algum momento do intervalo.
  isBlocked: (interval: BlockInterval) => Promise<boolean>;
  // Estação da unidade; null quando não existe nela.
  findStation: (id: string) => Promise<{ id: string; name: string; active: boolean } | null>;
  // Outros agendamentos da estação que se sobrepõem ao intervalo.
  findStationBookings: FindStationBookings;
  findProducts: FindProducts;
};

type FieldsError = Exclude<
  BookingError,
  "unit_not_found" | "booking_not_found" | "booking_registered" | "duration_locked"
>;

function isDurationValid(minutes: number) {
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

type Schedule = {
  stationId: string;
  guest: { name: string; room: string };
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  color: string | null;
};

// Valida estação, hóspede, quarto, início, duração e cor do formulário.
function parseSchedule(input: Record<string, unknown>): { ok: true; schedule: Schedule } | { ok: false; error: FieldsError } {
  const { guestName, room, startsAt, durationMinutes, stationId, color } = input;
  if (
    typeof guestName !== "string" ||
    typeof room !== "string" ||
    typeof startsAt !== "string" ||
    typeof durationMinutes !== "string" ||
    typeof stationId !== "string"
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedStationId = stationId.trim();
  if (!normalizedStationId) return { ok: false, error: "invalid_station" };

  const name = guestName.trim();
  if (!name) return { ok: false, error: "invalid_guest_name" };
  if (name.length > MAX_GUEST_NAME_LENGTH) return { ok: false, error: "guest_name_too_long" };

  const normalizedRoom = room.trim();
  if (!normalizedRoom) return { ok: false, error: "invalid_room" };
  if (normalizedRoom.length > MAX_ROOM_LENGTH) return { ok: false, error: "room_too_long" };

  const start = parsePerformedAt(startsAt.trim());
  if (!start) return { ok: false, error: "invalid_starts_at" };

  const duration = durationMinutes.trim();
  if (!/^\d+$/.test(duration) || !isDurationValid(Number(duration))) return { ok: false, error: "invalid_duration" };

  // Sem cor (campo ausente ou vazio) fica null.
  if (color != null && typeof color !== "string") return { ok: false, error: "invalid_color" };
  const normalizedColor = color?.trim() || null;
  if (normalizedColor && !isBookingColor(normalizedColor)) return { ok: false, error: "invalid_color" };

  return {
    ok: true,
    schedule: {
      stationId: normalizedStationId,
      guest: { name, room: normalizedRoom },
      startsAt: start,
      endsAt: new Date(start.getTime() + Number(duration) * MINUTE_MS),
      durationMinutes: Number(duration),
      color: normalizedColor,
    },
  };
}

// Confere agenda travada e conflito do profissional (se houver) e se a estação está livre,
// ignorando o próprio agendamento na edição. Cada estação atende um agendamento por vez.
async function checkAvailability(
  {
    therapistId,
    stationId,
    startsAt,
    endsAt,
    excludeId,
  }: { therapistId: string | null; stationId: string; startsAt: Date; endsAt: Date; excludeId?: string },
  { hasConflict, isBlocked, findStationBookings }: Pick<Lookups, "hasConflict" | "isBlocked" | "findStationBookings">,
): Promise<"therapist_unavailable" | "therapist_busy" | "station_busy" | null> {
  if (therapistId) {
    if (await isBlocked({ therapistId, startsAt, endsAt })) return "therapist_unavailable";
    const interval: Interval = { therapistId, startsAt, endsAt };
    if (excludeId) interval.excludeId = excludeId;
    if (await hasConflict(interval)) return "therapist_busy";
  }

  const stationInterval: StationInterval = { stationId, startsAt, endsAt };
  if (excludeId) stationInterval.excludeId = excludeId;
  const overlapping = (await findStationBookings(stationInterval)).some(
    (booking) => booking.startsAt < endsAt && booking.endsAt > startsAt,
  );
  if (overlapping) return "station_busy";
  return null;
}

// Valida o input do formulário, resolve profissional, serviço e estação e confere agenda travada,
// conflito de horário do profissional e ocupação da estação, ignorando o próprio agendamento na edição.
async function resolveBookingFields(
  input: unknown,
  { findService, findTherapist, hasConflict, isBlocked, findStation, findStationBookings, findProducts }: Lookups,
  excludeId?: string,
): Promise<{ ok: true; fields: BookingFields } | { ok: false; error: FieldsError }> {
  const fields = (input ?? {}) as Record<string, unknown>;
  const { therapistId, serviceId, productIds } = fields;
  if ((therapistId != null && typeof therapistId !== "string") || typeof serviceId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const parsed = parseSchedule(fields);
  if (!parsed.ok && parsed.error === "invalid_input") return parsed;

  const normalizedServiceId = serviceId.trim();
  if (!normalizedServiceId) return { ok: false, error: "invalid_service" };
  if (!parsed.ok) return parsed;
  const { stationId: normalizedStationId, guest, startsAt: start, endsAt: end, color: normalizedColor } =
    parsed.schedule;

  const [service, station, selection] = await Promise.all([
    findService(normalizedServiceId),
    findStation(normalizedStationId),
    resolveProducts(productIds, findProducts),
  ]);
  if (!service) return { ok: false, error: "service_not_found" };

  // Serviço sem profissional descarta o que vier no formulário.
  let therapist: { id: string; name: string } | null = null;
  if (service.requiresTherapist) {
    const normalizedTherapistId = therapistId?.trim();
    if (!normalizedTherapistId) return { ok: false, error: "invalid_therapist" };
    therapist = await findTherapist(normalizedTherapistId);
    if (!therapist) return { ok: false, error: "therapist_not_found" };
  }
  if (!station) return { ok: false, error: "station_not_found" };
  if (!station.active) return { ok: false, error: "station_inactive" };
  if (service.stationIds.length && !service.stationIds.includes(normalizedStationId)) {
    return { ok: false, error: "station_not_allowed" };
  }
  if (!selection.ok) return selection;

  const unavailable = await checkAvailability(
    { therapistId: therapist?.id ?? null, stationId: normalizedStationId, startsAt: start, endsAt: end, excludeId },
    { hasConflict, isBlocked, findStationBookings },
  );
  if (unavailable) return { ok: false, error: unavailable };

  return {
    ok: true,
    fields: {
      therapistId: therapist?.id ?? null,
      therapistName: therapist?.name ?? null,
      guest,
      startsAt: start,
      endsAt: end,
      service: { serviceId: normalizedServiceId, serviceName: service.name },
      station: { stationId: normalizedStationId, stationName: station.name },
      products: selection.products,
      color: normalizedColor,
    },
  };
}

export type CreateBookingResult = { ok: true; bookingId: string } | { ok: false; error: BookingError };

export async function createBooking(
  input: unknown,
  unitId: string | null | undefined,
  { insert, ...lookups }: Lookups & { insert: (data: BookingData) => Promise<{ id: string }> },
): Promise<CreateBookingResult> {
  if (!unitId) return { ok: false, error: "unit_not_found" };

  const resolved = await resolveBookingFields(input, lookups);
  if (!resolved.ok) return resolved;

  const booking = await insert({ unitId, ...resolved.fields });
  return { ok: true, bookingId: booking.id };
}

export type BookingResult = { ok: true } | { ok: false; error: BookingError };

// update devolve false quando o agendamento não existe (ou não é da unidade) e "registered"
// quando ele já virou atendimento (e não foi alterado).
export async function updateBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    update,
    ...lookups
  }: Lookups & { update: (bookingId: string, fields: BookingFields) => Promise<boolean | "registered"> },
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const resolved = await resolveBookingFields(input, lookups, bookingId);
  if (!resolved.ok) return resolved;

  const found = await update(bookingId, resolved.fields);
  if (found === "registered") return { ok: false, error: "booking_registered" };
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// Agendamento que já virou atendimento, com o que a correção precisa saber dele.
type RegisteredBooking = { therapistId: string | null; serviceId: string; durationMinutes: number; serviceCount: number };

// Campos do agendamento corrigíveis depois do registro.
export type CorrectionFields = Pick<BookingFields, "guest" | "startsAt" | "endsAt" | "station" | "color">;

// O que a correção leva para o atendimento. durationMinutes null: a duração não mudou.
export type AppointmentSync = {
  performedAt: Date;
  guest: { name: string; room: string };
  durationMinutes: number | null;
};

// Corrige pelo formulário um agendamento que já virou atendimento: horário, duração, hóspede,
// quarto, estação e cor. Serviço, profissional e produtos ficam com o atendimento. Com vários
// serviços no atendimento, a duração não muda. findBooking devolve null quando o agendamento
// não existe (ou não é do workspace) ou ainda não virou atendimento; update, false quando ele some.
export async function correctRegisteredBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    findBooking,
    findService,
    findStation,
    update,
    ...availability
  }: Pick<Lookups, "findService" | "findStation" | "hasConflict" | "isBlocked" | "findStationBookings"> & {
    findBooking: (bookingId: string) => Promise<RegisteredBooking | null>;
    update: (bookingId: string, fields: CorrectionFields, appointment: AppointmentSync) => Promise<boolean>;
  },
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const parsed = parseSchedule((input ?? {}) as Record<string, unknown>);
  if (!parsed.ok) return parsed;
  const { stationId, guest, startsAt, endsAt, durationMinutes, color } = parsed.schedule;

  const booking = await findBooking(bookingId);
  if (!booking) return { ok: false, error: "booking_not_found" };
  const durationChanged = durationMinutes !== booking.durationMinutes;
  if (durationChanged && booking.serviceCount > 1) return { ok: false, error: "duration_locked" };

  const [service, station] = await Promise.all([findService(booking.serviceId), findStation(stationId)]);
  if (!station) return { ok: false, error: "station_not_found" };
  // Serviço removido da unidade: qualquer estação dela serve.
  if (service?.stationIds.length && !service.stationIds.includes(stationId)) {
    return { ok: false, error: "station_not_allowed" };
  }

  const unavailable = await checkAvailability(
    { therapistId: booking.therapistId, stationId, startsAt, endsAt, excludeId: bookingId },
    availability,
  );
  if (unavailable) return { ok: false, error: unavailable };

  const found = await update(
    bookingId,
    { guest, startsAt, endsAt, station: { stationId, stationName: station.name }, color },
    { performedAt: startsAt, guest, durationMinutes: durationChanged ? durationMinutes : null },
  );
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// Arrastar ou redimensionar no calendário: só início e fim mudam, no formato do formulário.
export async function rescheduleBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    findBooking,
    hasConflict,
    isBlocked,
    findStationBookings,
    update,
  }: {
    // station null: a estação foi removida da unidade. therapistId null: serviço sem profissional.
    // registered: já virou atendimento, com quantos serviços ele tem e a duração atual do agendamento.
    findBooking: (bookingId: string) => Promise<{
      therapistId: string | null;
      station: { stationId: string; active: boolean } | null;
      registered?: { serviceCount: number; durationMinutes: number };
    } | null>;
    hasConflict: Lookups["hasConflict"];
    isBlocked: Lookups["isBlocked"];
    findStationBookings: FindStationBookings;
    // appointment: o que levar para o atendimento, só quando o agendamento já virou um.
    update: (
      bookingId: string,
      times: { startsAt: Date; endsAt: Date },
      appointment?: Omit<AppointmentSync, "guest">,
    ) => Promise<boolean>;
  },
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const { startsAt, endsAt } = (input ?? {}) as Record<string, unknown>;
  if (typeof startsAt !== "string" || typeof endsAt !== "string") return { ok: false, error: "invalid_input" };

  const start = parsePerformedAt(startsAt.trim());
  if (!start) return { ok: false, error: "invalid_starts_at" };
  const end = parsePerformedAt(endsAt.trim());
  const durationMinutes = end ? (end.getTime() - start.getTime()) / MINUTE_MS : 0;
  if (!end || !isDurationValid(durationMinutes)) return { ok: false, error: "invalid_duration" };

  const booking = await findBooking(bookingId);
  if (!booking) return { ok: false, error: "booking_not_found" };
  const { registered } = booking;
  const durationChanged = registered && durationMinutes !== registered.durationMinutes;
  if (durationChanged && registered.serviceCount > 1) return { ok: false, error: "duration_locked" };
  if (!booking.station) return { ok: false, error: "station_not_found" };
  if (!booking.station.active && !registered) return { ok: false, error: "station_inactive" };

  const unavailable = await checkAvailability(
    { therapistId: booking.therapistId, stationId: booking.station.stationId, startsAt: start, endsAt: end, excludeId: bookingId },
    { hasConflict, isBlocked, findStationBookings },
  );
  if (unavailable) return { ok: false, error: unavailable };

  const times = { startsAt: start, endsAt: end };
  const found = registered
    ? await update(bookingId, times, { performedAt: start, durationMinutes: durationChanged ? durationMinutes : null })
    : await update(bookingId, times);
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// remove devolve false quando o agendamento não existe (ou não é do workspace).
export async function deleteBooking(
  bookingId: string | null | undefined,
  remove: (bookingId: string) => Promise<boolean>,
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const found = await remove(bookingId);
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}
