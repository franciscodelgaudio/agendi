import { parsePerformedAt } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment";
import { isBookingColor } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors";
import { peakOccupancy } from "@/service/workspace/[workspaceId]/unit/[unitId]/treatment-room";
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
  | "invalid_treatment_room"
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
  | "treatment_room_not_found"
  | "treatment_room_not_allowed"
  | "room_full"
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
  // Sala de atendimento da unidade, com cópia do nome do momento do agendamento.
  treatmentRoom: { roomId: string; roomName: string };
  products: SelectedProduct[];
  // Cor no calendário; null usa a do profissional.
  color: string | null;
};

export type BookingData = BookingFields & { unitId: string };

type Interval = { therapistId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type BlockInterval = { therapistId: string; startsAt: Date; endsAt: Date };
type RoomInterval = { treatmentRoomId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type FindRoomBookings = (interval: RoomInterval) => Promise<readonly { startsAt: Date; endsAt: Date }[]>;

type Lookups = {
  // true quando a unidade funciona dentro de um parceiro: o quarto do cliente é obrigatório.
  guestRoomRequired: boolean;
  // Devolvem null quando não existe: serviço da unidade e quem pode atender no workspace.
  // treatmentRoomIds vazio: o serviço pode usar qualquer espaço da unidade.
  findService: (
    id: string,
  ) => Promise<{ id: string; name: string; requiresTherapist: boolean; treatmentRoomIds: string[] } | null>;
  findTherapist: (id: string) => Promise<{ id: string; name: string } | null>;
  // true quando o profissional já tem outro agendamento que se sobrepõe ao intervalo.
  hasConflict: (interval: Interval) => Promise<boolean>;
  // true quando a agenda do profissional está travada em algum momento do intervalo.
  isBlocked: (interval: BlockInterval) => Promise<boolean>;
  // Sala da unidade; null quando não existe nela.
  findTreatmentRoom: (id: string) => Promise<{ id: string; name: string; beds: number } | null>;
  // Outros agendamentos da sala que se sobrepõem ao intervalo.
  findRoomBookings: FindRoomBookings;
  findProducts: FindProducts;
};

type FieldsError = Exclude<
  BookingError,
  "unit_not_found" | "booking_not_found" | "booking_registered" | "duration_locked"
>;

function isDurationValid(minutes: number) {
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

// true quando o espaço já está lotado (capacidade = beds) em algum momento do intervalo.
async function isRoomFull(interval: RoomInterval, beds: number, findRoomBookings: FindRoomBookings) {
  return peakOccupancy(await findRoomBookings(interval), interval) >= beds;
}

type Schedule = {
  treatmentRoomId: string;
  guest: { name: string; room: string };
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  color: string | null;
};

// Quarto do cliente: obrigatório quando a unidade funciona dentro de um parceiro, a não ser
// para cliente de fora (outsideGuest), que não tem quarto e paga na hora. Em espaço próprio é
// opcional. Quarto vazio numa unidade com parceiro = cliente de fora.
function parseGuestRoom(room: string, outsideGuest: boolean, guestRoomRequired: boolean) {
  if (outsideGuest) return { ok: true as const, room: "" };
  const normalizedRoom = room.trim();
  if (!normalizedRoom && guestRoomRequired) return { ok: false as const, error: "invalid_room" as const };
  if (normalizedRoom.length > MAX_ROOM_LENGTH) return { ok: false as const, error: "room_too_long" as const };
  return { ok: true as const, room: normalizedRoom };
}

// Valida espaço, hóspede, quarto, início, duração e cor do formulário.
function parseSchedule(
  input: Record<string, unknown>,
  guestRoomRequired: boolean,
): { ok: true; schedule: Schedule } | { ok: false; error: FieldsError } {
  const { guestName, room, outsideGuest, startsAt, durationMinutes, treatmentRoomId, color } = input;
  if (
    typeof guestName !== "string" ||
    typeof room !== "string" ||
    typeof startsAt !== "string" ||
    typeof durationMinutes !== "string" ||
    typeof treatmentRoomId !== "string"
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedRoomId = treatmentRoomId.trim();
  if (!normalizedRoomId) return { ok: false, error: "invalid_treatment_room" };

  const name = guestName.trim();
  if (!name) return { ok: false, error: "invalid_guest_name" };
  if (name.length > MAX_GUEST_NAME_LENGTH) return { ok: false, error: "guest_name_too_long" };

  const guestRoom = parseGuestRoom(room, outsideGuest === true, guestRoomRequired);
  if (!guestRoom.ok) return guestRoom;

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
      treatmentRoomId: normalizedRoomId,
      guest: { name, room: guestRoom.room },
      startsAt: start,
      endsAt: new Date(start.getTime() + Number(duration) * MINUTE_MS),
      durationMinutes: Number(duration),
      color: normalizedColor,
    },
  };
}

// Confere agenda travada e conflito do profissional (se houver) e ocupação do espaço,
// ignorando o próprio agendamento na edição.
async function checkAvailability(
  {
    therapistId,
    room,
    startsAt,
    endsAt,
    excludeId,
  }: { therapistId: string | null; room: { roomId: string; beds: number }; startsAt: Date; endsAt: Date; excludeId?: string },
  { hasConflict, isBlocked, findRoomBookings }: Pick<Lookups, "hasConflict" | "isBlocked" | "findRoomBookings">,
): Promise<"therapist_unavailable" | "therapist_busy" | "room_full" | null> {
  if (therapistId) {
    if (await isBlocked({ therapistId, startsAt, endsAt })) return "therapist_unavailable";
    const interval: Interval = { therapistId, startsAt, endsAt };
    if (excludeId) interval.excludeId = excludeId;
    if (await hasConflict(interval)) return "therapist_busy";
  }

  const roomInterval: RoomInterval = { treatmentRoomId: room.roomId, startsAt, endsAt };
  if (excludeId) roomInterval.excludeId = excludeId;
  if (await isRoomFull(roomInterval, room.beds, findRoomBookings)) return "room_full";
  return null;
}

// Valida o input do formulário, resolve profissional, serviço e sala e confere agenda travada,
// conflito de horário do profissional e ocupação da sala, ignorando o próprio agendamento na edição.
async function resolveBookingFields(
  input: unknown,
  { guestRoomRequired, findService, findTherapist, hasConflict, isBlocked, findTreatmentRoom, findRoomBookings, findProducts }: Lookups,
  excludeId?: string,
): Promise<{ ok: true; fields: BookingFields } | { ok: false; error: FieldsError }> {
  const fields = (input ?? {}) as Record<string, unknown>;
  const { therapistId, serviceId, productIds } = fields;
  if ((therapistId != null && typeof therapistId !== "string") || typeof serviceId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const parsed = parseSchedule(fields, guestRoomRequired);
  if (!parsed.ok && parsed.error === "invalid_input") return parsed;

  const normalizedServiceId = serviceId.trim();
  if (!normalizedServiceId) return { ok: false, error: "invalid_service" };
  if (!parsed.ok) return parsed;
  const { treatmentRoomId: normalizedRoomId, guest, startsAt: start, endsAt: end, color: normalizedColor } =
    parsed.schedule;

  const [service, treatmentRoom, selection] = await Promise.all([
    findService(normalizedServiceId),
    findTreatmentRoom(normalizedRoomId),
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
  if (!treatmentRoom) return { ok: false, error: "treatment_room_not_found" };
  if (service.treatmentRoomIds.length && !service.treatmentRoomIds.includes(normalizedRoomId)) {
    return { ok: false, error: "treatment_room_not_allowed" };
  }
  if (!selection.ok) return selection;

  const unavailable = await checkAvailability(
    {
      therapistId: therapist?.id ?? null,
      room: { roomId: normalizedRoomId, beds: treatmentRoom.beds },
      startsAt: start,
      endsAt: end,
      excludeId,
    },
    { hasConflict, isBlocked, findRoomBookings },
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
      treatmentRoom: { roomId: normalizedRoomId, roomName: treatmentRoom.name },
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
export type CorrectionFields = Pick<BookingFields, "guest" | "startsAt" | "endsAt" | "treatmentRoom" | "color">;

// O que a correção leva para o atendimento. durationMinutes null: a duração não mudou.
export type AppointmentSync = {
  performedAt: Date;
  guest: { name: string; room: string };
  durationMinutes: number | null;
};

// Corrige pelo formulário um agendamento que já virou atendimento: horário, duração, hóspede,
// quarto, espaço e cor. Serviço, profissional e produtos ficam com o atendimento. Com vários
// serviços no atendimento, a duração não muda. findBooking devolve null quando o agendamento
// não existe (ou não é do workspace) ou ainda não virou atendimento; update, false quando ele some.
export async function correctRegisteredBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    guestRoomRequired,
    findBooking,
    findService,
    findTreatmentRoom,
    update,
    ...availability
  }: Pick<Lookups, "guestRoomRequired" | "findService" | "findTreatmentRoom" | "hasConflict" | "isBlocked" | "findRoomBookings"> & {
    findBooking: (bookingId: string) => Promise<RegisteredBooking | null>;
    update: (bookingId: string, fields: CorrectionFields, appointment: AppointmentSync) => Promise<boolean>;
  },
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const parsed = parseSchedule((input ?? {}) as Record<string, unknown>, guestRoomRequired);
  if (!parsed.ok) return parsed;
  const { treatmentRoomId, guest, startsAt, endsAt, durationMinutes, color } = parsed.schedule;

  const booking = await findBooking(bookingId);
  if (!booking) return { ok: false, error: "booking_not_found" };
  const durationChanged = durationMinutes !== booking.durationMinutes;
  if (durationChanged && booking.serviceCount > 1) return { ok: false, error: "duration_locked" };

  const [service, treatmentRoom] = await Promise.all([findService(booking.serviceId), findTreatmentRoom(treatmentRoomId)]);
  if (!treatmentRoom) return { ok: false, error: "treatment_room_not_found" };
  // Serviço removido da unidade: qualquer espaço dela serve.
  if (service?.treatmentRoomIds.length && !service.treatmentRoomIds.includes(treatmentRoomId)) {
    return { ok: false, error: "treatment_room_not_allowed" };
  }

  const unavailable = await checkAvailability(
    {
      therapistId: booking.therapistId,
      room: { roomId: treatmentRoomId, beds: treatmentRoom.beds },
      startsAt,
      endsAt,
      excludeId: bookingId,
    },
    availability,
  );
  if (unavailable) return { ok: false, error: unavailable };

  const found = await update(
    bookingId,
    { guest, startsAt, endsAt, treatmentRoom: { roomId: treatmentRoomId, roomName: treatmentRoom.name }, color },
    { performedAt: startsAt, guest, durationMinutes: durationChanged ? durationMinutes : null },
  );
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// Arrastar ou redimensionar no calendário: só início e fim mudam, no formato do formulário.
// Agendamento que já virou atendimento não se arrasta; a correção é pelo formulário.
export async function rescheduleBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    findBooking,
    hasConflict,
    isBlocked,
    findRoomBookings,
    update,
  }: {
    // treatmentRoom null: a sala foi removida da unidade. therapistId null: serviço sem profissional.
    // registered: já virou atendimento.
    findBooking: (bookingId: string) => Promise<{
      therapistId: string | null;
      treatmentRoom: { roomId: string; beds: number } | null;
      registered?: boolean;
    } | null>;
    hasConflict: Lookups["hasConflict"];
    isBlocked: Lookups["isBlocked"];
    findRoomBookings: FindRoomBookings;
    update: (bookingId: string, times: { startsAt: Date; endsAt: Date }) => Promise<boolean>;
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
  if (booking.registered) return { ok: false, error: "booking_registered" };
  if (!booking.treatmentRoom) return { ok: false, error: "treatment_room_not_found" };

  const unavailable = await checkAvailability(
    { therapistId: booking.therapistId, room: booking.treatmentRoom, startsAt: start, endsAt: end, excludeId: bookingId },
    { hasConflict, isBlocked, findRoomBookings },
  );
  if (unavailable) return { ok: false, error: unavailable };

  const found = await update(bookingId, { startsAt: start, endsAt: end });
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// remove devolve false quando o agendamento não existe (ou não é do workspace) e "registered"
// quando ele já virou atendimento (e não foi excluído).
export async function deleteBooking(
  bookingId: string | null | undefined,
  remove: (bookingId: string) => Promise<boolean | "registered">,
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const found = await remove(bookingId);
  if (found === "registered") return { ok: false, error: "booking_registered" };
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}
