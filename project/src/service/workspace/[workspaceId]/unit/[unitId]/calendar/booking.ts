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
  | "treatment_room_not_found"
  | "room_full"
  | "unit_not_found"
  | "booking_not_found"
  | ProductSelectionError;

// Dados editáveis de um agendamento (tudo menos a unidade). Os nomes do profissional e do
// serviço são cópias do momento do agendamento.
export type BookingFields = {
  therapistId: string;
  therapistName: string;
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
type RoomInterval = { treatmentRoomId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type FindRoomBookings = (interval: RoomInterval) => Promise<readonly { startsAt: Date; endsAt: Date }[]>;

type Lookups = {
  // Devolvem null quando não existe: serviço da unidade e quem pode atender no workspace.
  findService: (id: string) => Promise<{ id: string; name: string } | null>;
  findTherapist: (id: string) => Promise<{ id: string; name: string } | null>;
  // true quando o profissional já tem outro agendamento que se sobrepõe ao intervalo.
  hasConflict: (interval: Interval) => Promise<boolean>;
  // Sala da unidade; null quando não existe nela.
  findTreatmentRoom: (id: string) => Promise<{ id: string; name: string; beds: number } | null>;
  // Outros agendamentos da sala que se sobrepõem ao intervalo.
  findRoomBookings: FindRoomBookings;
  findProducts: FindProducts;
};

type FieldsError = Exclude<BookingError, "unit_not_found" | "booking_not_found">;

function isDurationValid(minutes: number) {
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

// true quando todas as macas da sala já estão ocupadas em algum momento do intervalo.
async function isRoomFull(interval: RoomInterval, beds: number, findRoomBookings: FindRoomBookings) {
  return peakOccupancy(await findRoomBookings(interval), interval) >= beds;
}

// Valida o input do formulário, resolve profissional, serviço e sala e confere conflito
// de horário do profissional e ocupação da sala, ignorando o próprio agendamento na edição.
async function resolveBookingFields(
  input: unknown,
  { findService, findTherapist, hasConflict, findTreatmentRoom, findRoomBookings, findProducts }: Lookups,
  excludeId?: string,
): Promise<{ ok: true; fields: BookingFields } | { ok: false; error: FieldsError }> {
  const { therapistId, guestName, room, startsAt, durationMinutes, serviceId, treatmentRoomId, productIds, color } =
    (input ?? {}) as Record<string, unknown>;
  if (
    typeof therapistId !== "string" ||
    typeof guestName !== "string" ||
    typeof room !== "string" ||
    typeof startsAt !== "string" ||
    typeof durationMinutes !== "string" ||
    typeof serviceId !== "string" ||
    typeof treatmentRoomId !== "string"
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedTherapistId = therapistId.trim();
  if (!normalizedTherapistId) return { ok: false, error: "invalid_therapist" };

  const normalizedServiceId = serviceId.trim();
  if (!normalizedServiceId) return { ok: false, error: "invalid_service" };

  const normalizedRoomId = treatmentRoomId.trim();
  if (!normalizedRoomId) return { ok: false, error: "invalid_treatment_room" };

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
  const end = new Date(start.getTime() + Number(duration) * MINUTE_MS);

  // Sem cor (campo ausente ou vazio) fica null.
  if (color != null && typeof color !== "string") return { ok: false, error: "invalid_color" };
  const normalizedColor = color?.trim() || null;
  if (normalizedColor && !isBookingColor(normalizedColor)) return { ok: false, error: "invalid_color" };

  const [service, therapist, treatmentRoom, selection] = await Promise.all([
    findService(normalizedServiceId),
    findTherapist(normalizedTherapistId),
    findTreatmentRoom(normalizedRoomId),
    resolveProducts(productIds, findProducts),
  ]);
  if (!service) return { ok: false, error: "service_not_found" };
  if (!therapist) return { ok: false, error: "therapist_not_found" };
  if (!treatmentRoom) return { ok: false, error: "treatment_room_not_found" };
  if (!selection.ok) return selection;

  const interval: Interval = { therapistId: normalizedTherapistId, startsAt: start, endsAt: end };
  if (excludeId) interval.excludeId = excludeId;
  if (await hasConflict(interval)) return { ok: false, error: "therapist_busy" };

  const roomInterval: RoomInterval = { treatmentRoomId: normalizedRoomId, startsAt: start, endsAt: end };
  if (excludeId) roomInterval.excludeId = excludeId;
  if (await isRoomFull(roomInterval, treatmentRoom.beds, findRoomBookings)) return { ok: false, error: "room_full" };

  return {
    ok: true,
    fields: {
      therapistId: normalizedTherapistId,
      therapistName: therapist.name,
      guest: { name, room: normalizedRoom },
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

// update devolve false quando o agendamento não existe (ou não é da unidade).
export async function updateBooking(
  input: unknown,
  bookingId: string | null | undefined,
  { update, ...lookups }: Lookups & { update: (bookingId: string, fields: BookingFields) => Promise<boolean> },
): Promise<BookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const resolved = await resolveBookingFields(input, lookups, bookingId);
  if (!resolved.ok) return resolved;

  const found = await update(bookingId, resolved.fields);
  return found ? { ok: true } : { ok: false, error: "booking_not_found" };
}

// Arrastar ou redimensionar no calendário: só início e fim mudam, no formato do formulário.
export async function rescheduleBooking(
  input: unknown,
  bookingId: string | null | undefined,
  {
    findBooking,
    hasConflict,
    findRoomBookings,
    update,
  }: {
    // treatmentRoom null: a sala foi removida da unidade.
    findBooking: (
      bookingId: string,
    ) => Promise<{ therapistId: string; treatmentRoom: { roomId: string; beds: number } | null } | null>;
    hasConflict: Lookups["hasConflict"];
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
  if (!end || !isDurationValid((end.getTime() - start.getTime()) / MINUTE_MS)) {
    return { ok: false, error: "invalid_duration" };
  }

  const booking = await findBooking(bookingId);
  if (!booking) return { ok: false, error: "booking_not_found" };
  if (!booking.treatmentRoom) return { ok: false, error: "treatment_room_not_found" };
  if (await hasConflict({ therapistId: booking.therapistId, startsAt: start, endsAt: end, excludeId: bookingId })) {
    return { ok: false, error: "therapist_busy" };
  }
  const { roomId, beds } = booking.treatmentRoom;
  const roomInterval = { treatmentRoomId: roomId, startsAt: start, endsAt: end, excludeId: bookingId };
  if (await isRoomFull(roomInterval, beds, findRoomBookings)) return { ok: false, error: "room_full" };

  const found = await update(bookingId, { startsAt: start, endsAt: end });
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
