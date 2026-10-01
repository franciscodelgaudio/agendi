import { createAppointment, type AppointmentData, type CreateAppointmentError } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment";
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type ConvertBookingResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: CreateAppointmentError | "booking_not_found" | "booking_already_converted" };

type Deps = Omit<Parameters<typeof createAppointment>[2], "insert"> & {
  // null quando o agendamento não existe (ou não é do workspace).
  findBooking: (bookingId: string) => Promise<{ appointmentId: string | null } | null>;
  insert: (data: AppointmentData) => Promise<{ id: string }>;
  // Liga o atendimento ao agendamento só se ele ainda não tiver um; false se outro chegou antes.
  link: (bookingId: string, appointmentId: string) => Promise<boolean>;
  removeAppointment: (appointmentId: string) => Promise<void>;
};

// Registra o atendimento a partir do agendamento: o input é o formulário de atendimento
// (pré-preenchido com os dados do agendamento), validado como qualquer atendimento.
export async function convertBooking(
  input: unknown,
  { bookingId, unitId }: { bookingId: string | null | undefined; unitId: string | null | undefined },
  { findBooking, link, removeAppointment, ...appointmentDeps }: Deps,
): Promise<ConvertBookingResult> {
  if (!bookingId) return { ok: false, error: "booking_not_found" };

  const booking = await findBooking(bookingId);
  if (!booking) return { ok: false, error: "booking_not_found" };
  if (booking.appointmentId) return { ok: false, error: "booking_already_converted" };

  const created = await createAppointment(input, unitId, appointmentDeps);
  if (!created.ok) return created;

  // Duas conversões ao mesmo tempo: só uma consegue ligar; a outra desfaz o atendimento criado.
  if (!(await link(bookingId, created.appointmentId))) {
    await removeAppointment(created.appointmentId);
    return { ok: false, error: "booking_already_converted" };
  }
  return created;
}

export type BookingForAppointment = {
  guest: { name: string; room: string };
  startsAt: Date;
  endsAt: Date;
  service: { serviceId: string };
  therapistId: string;
  products: { productId: string }[];
};

// Registro com um clique: monta, a partir do agendamento salvo, o mesmo input do formulário de
// atendimento (horário de Brasília e a duração do agendamento), para convertBooking validar.
export function bookingAppointmentInput(booking: BookingForAppointment) {
  return {
    guestName: booking.guest.name,
    room: booking.guest.room,
    performedAt: new Date(booking.startsAt.getTime() - BRT_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 16),
    serviceIds: [booking.service.serviceId],
    therapistIds: [booking.therapistId],
    durations: [String(Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / MINUTE_MS))],
    productIds: booking.products.map((product) => product.productId),
  };
}
