import { BRT_OFFSET_HOURS, parseDay } from "@/service/_shared/timezone";
import { isBookingColor } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors";
import { parseDurationMinutes } from "@/service/workspace/[workspaceId]/services/service";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MINUTE_MS = 60 * 1000;

export const APPOINTMENT_STATUSES = ["scheduled", "done", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

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

type MemberInterval = { workspaceMemberId: string; startsAt: Date; endsAt: Date; excludeId?: string };
type StationInterval = { stationId: string; startsAt: Date; endsAt: Date; excludeId?: string };

type AvailabilityLookups = {
  hasConflict: (interval: MemberInterval) => Promise<boolean>;
  isBlocked: (interval: Omit<MemberInterval, "excludeId">) => Promise<boolean>;
  findStationAppointments: (interval: StationInterval) => Promise<readonly { startsAt: Date; endsAt: Date }[]>;
};

type Lookups = AvailabilityLookups & {
  findService: (id: string) => Promise<{ id: string; name: string; durationMinutes: number } | null>;
  findCustomer: (id: string) => Promise<{ id: string } | null>;
  findMember: (id: string) => Promise<{ id: string } | null>;
  findStation: (id: string) => Promise<{ id: string; active: boolean } | null>;
};

type AvailabilityError = "member_unavailable" | "member_busy" | "station_busy";

export type AppointmentFieldsError =
  | "invalid_input"
  | "invalid_service"
  | "invalid_customer"
  | "invalid_member"
  | "invalid_station"
  | "invalid_starts_at"
  | "invalid_duration"
  | "invalid_color"
  | "service_not_found"
  | "customer_not_found"
  | "member_not_found"
  | "station_not_found"
  | "station_inactive"
  | AvailabilityError;

export type AppointmentFields = {
  serviceId: string;
  customerId: string;
  workspaceMemberId: string;
  stationId: string;
  name: string;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
  color: string | null;
};

async function checkAvailability(
  { workspaceMemberId, stationId, startsAt, endsAt, excludeId }: MemberInterval & { stationId: string },
  { hasConflict, isBlocked, findStationAppointments }: AvailabilityLookups,
): Promise<AvailabilityError | null> {
  if (await isBlocked({ workspaceMemberId, startsAt, endsAt })) return "member_unavailable";
  if (await hasConflict({ workspaceMemberId, startsAt, endsAt, ...(excludeId && { excludeId }) })) return "member_busy";
  const stationAppointments = await findStationAppointments({ stationId, startsAt, endsAt, ...(excludeId && { excludeId }) });
  if (stationAppointments.some((other) => other.startsAt < endsAt && other.endsAt > startsAt)) return "station_busy";
  return null;
}

function requiredId(value: unknown, error: AppointmentFieldsError) {
  if (typeof value !== "string") return { error: "invalid_input" as const };
  const id = value.trim();
  return id ? { id } : { error };
}

async function resolveFields(
  input: unknown,
  lookups: Lookups,
  excludeId?: string,
): Promise<{ ok: true; fields: AppointmentFields } | { ok: false; error: AppointmentFieldsError }> {
  const { serviceId, customerId, workspaceMemberId, stationId, startsAt, durationMinutes, color } = (input ??
    {}) as Record<string, unknown>;
  if (input == null || typeof startsAt !== "string") return { ok: false, error: "invalid_input" };
  if (durationMinutes != null && typeof durationMinutes !== "string") return { ok: false, error: "invalid_input" };
  if (color != null && typeof color !== "string") return { ok: false, error: "invalid_input" };

  const ids = [
    requiredId(serviceId, "invalid_service"),
    requiredId(customerId, "invalid_customer"),
    requiredId(workspaceMemberId, "invalid_member"),
    requiredId(stationId, "invalid_station"),
  ];
  for (const id of ids) {
    if ("error" in id) return { ok: false, error: id.error as AppointmentFieldsError };
  }
  const [service, customer, member, station] = ids.map((id) => (id as { id: string }).id);

  const start = parsePerformedAt(startsAt.trim());
  if (!start) return { ok: false, error: "invalid_starts_at" };
  const customDuration = durationMinutes?.trim() ? parseDurationMinutes(durationMinutes) : undefined;
  if (customDuration === null) return { ok: false, error: "invalid_duration" };
  const normalizedColor = color?.trim() || null;
  if (normalizedColor && !isBookingColor(normalizedColor)) return { ok: false, error: "invalid_color" };

  const foundService = await lookups.findService(service);
  if (!foundService) return { ok: false, error: "service_not_found" };
  if (!(await lookups.findCustomer(customer))) return { ok: false, error: "customer_not_found" };
  if (!(await lookups.findMember(member))) return { ok: false, error: "member_not_found" };
  const foundStation = await lookups.findStation(station);
  if (!foundStation) return { ok: false, error: "station_not_found" };
  if (!foundStation.active) return { ok: false, error: "station_inactive" };

  const minutes = customDuration ?? foundService.durationMinutes;
  const end = new Date(start.getTime() + minutes * MINUTE_MS);
  const unavailable = await checkAvailability(
    { workspaceMemberId: member, stationId: station, startsAt: start, endsAt: end, excludeId },
    lookups,
  );
  if (unavailable) return { ok: false, error: unavailable };

  return {
    ok: true,
    fields: {
      serviceId: service,
      customerId: customer,
      workspaceMemberId: member,
      stationId: station,
      name: foundService.name,
      durationMinutes: minutes,
      startsAt: start,
      endsAt: end,
      color: normalizedColor,
    },
  };
}

export type AppointmentData = AppointmentFields & { workspaceId: string; unitId: string; status: "scheduled" };

export type CreateAppointmentResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: AccessError | AppointmentFieldsError };

export async function createAppointment(
  input: unknown,
  ctx: { workspaceId: string; unitId: string; actor: Actor | null },
  { insert, ...lookups }: Lookups & { insert: (data: AppointmentData) => Promise<{ id: string }> },
): Promise<CreateAppointmentResult> {
  const accessError = checkAccess(ctx.actor, "bookings.manage");
  if (accessError) return { ok: false, error: accessError };

  const resolved = await resolveFields(input, lookups);
  if (!resolved.ok) return resolved;

  const appointment = await insert({
    workspaceId: ctx.workspaceId,
    unitId: ctx.unitId,
    ...resolved.fields,
    status: "scheduled",
  });
  return { ok: true, appointmentId: appointment.id };
}

export type UpdateAppointmentError =
  | AccessError
  | AppointmentFieldsError
  | "appointment_not_found"
  | "appointment_not_scheduled";

export type AppointmentResult<E extends string> = { ok: true } | { ok: false; error: E };

export async function updateAppointment(
  input: unknown,
  appointmentId: string | null | undefined,
  ctx: { actor: Actor | null },
  {
    findAppointment,
    update,
    ...lookups
  }: Lookups & {
    findAppointment: (id: string) => Promise<{ status: string } | null>;
    update: (id: string, fields: AppointmentFields) => Promise<boolean>;
  },
): Promise<AppointmentResult<UpdateAppointmentError>> {
  const accessError = checkAccess(ctx.actor, "bookings.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  const found = await findAppointment(appointmentId);
  if (!found) return { ok: false, error: "appointment_not_found" };
  if (found.status !== "scheduled") return { ok: false, error: "appointment_not_scheduled" };

  const resolved = await resolveFields(input, lookups, appointmentId);
  if (!resolved.ok) return resolved;

  if (!(await update(appointmentId, resolved.fields))) return { ok: false, error: "appointment_not_found" };
  return { ok: true };
}

export type RescheduleAppointmentError =
  | AccessError
  | AvailabilityError
  | "invalid_input"
  | "invalid_starts_at"
  | "invalid_duration"
  | "appointment_not_found"
  | "appointment_not_scheduled"
  | "station_not_found"
  | "station_inactive";

export async function rescheduleAppointment(
  input: unknown,
  appointmentId: string | null | undefined,
  ctx: { actor: Actor | null },
  {
    findAppointment,
    update,
    ...availability
  }: AvailabilityLookups & {
    findAppointment: (id: string) => Promise<{
      status: string;
      workspaceMemberId: string;
      station: { id: string; active: boolean } | null;
    } | null>;
    update: (id: string, times: { startsAt: Date; endsAt: Date; durationMinutes: number }) => Promise<boolean>;
  },
): Promise<AppointmentResult<RescheduleAppointmentError>> {
  const accessError = checkAccess(ctx.actor, "bookings.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  const { startsAt, endsAt } = (input ?? {}) as Record<string, unknown>;
  if (typeof startsAt !== "string" || typeof endsAt !== "string") return { ok: false, error: "invalid_input" };
  const start = parsePerformedAt(startsAt.trim());
  if (!start) return { ok: false, error: "invalid_starts_at" };
  const end = parsePerformedAt(endsAt.trim());
  const durationMinutes = end ? (end.getTime() - start.getTime()) / MINUTE_MS : 0;
  if (!end || parseDurationMinutes(String(durationMinutes)) === null) return { ok: false, error: "invalid_duration" };

  const found = await findAppointment(appointmentId);
  if (!found) return { ok: false, error: "appointment_not_found" };
  if (found.status !== "scheduled") return { ok: false, error: "appointment_not_scheduled" };
  if (!found.station) return { ok: false, error: "station_not_found" };
  if (!found.station.active) return { ok: false, error: "station_inactive" };

  const unavailable = await checkAvailability(
    { workspaceMemberId: found.workspaceMemberId, stationId: found.station.id, startsAt: start, endsAt: end, excludeId: appointmentId },
    availability,
  );
  if (unavailable) return { ok: false, error: unavailable };

  if (!(await update(appointmentId, { startsAt: start, endsAt: end, durationMinutes }))) {
    return { ok: false, error: "appointment_not_found" };
  }
  return { ok: true };
}

export type SetAppointmentStatusError = AccessError | "invalid_status" | "appointment_not_found";

export async function setAppointmentStatus(
  input: unknown,
  appointmentId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findAppointment: (id: string) => Promise<{ status: string; serviceId: string } | null>;
    findServicePrice: (serviceId: string) => Promise<number | null>;
    update: (id: string, status: AppointmentStatus) => Promise<boolean>;
    recordIncome: (id: string, priceCents: number) => Promise<void>;
    removeIncome: (id: string) => Promise<void>;
  },
): Promise<AppointmentResult<SetAppointmentStatusError>> {
  if (!ctx.actor) return { ok: false, error: "workspace_not_found" };
  const { status } = (input ?? {}) as Record<string, unknown>;
  if (!APPOINTMENT_STATUSES.includes(status as AppointmentStatus)) return { ok: false, error: "invalid_status" };
  const next = status as AppointmentStatus;
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  const found = await deps.findAppointment(appointmentId);
  if (!found) return { ok: false, error: "appointment_not_found" };
  const touchesDone = next === "done" || found.status === "done";
  const accessError = checkAccess(ctx.actor, touchesDone ? "appointments.manage" : "bookings.manage");
  if (accessError) return { ok: false, error: accessError };
  if (found.status === next) return { ok: true };

  if (!(await deps.update(appointmentId, next))) return { ok: false, error: "appointment_not_found" };
  if (found.status === "done") await deps.removeIncome(appointmentId);
  if (next === "done") {
    const priceCents = await deps.findServicePrice(found.serviceId);
    if (priceCents) await deps.recordIncome(appointmentId, priceCents);
  }
  return { ok: true };
}

export async function deleteAppointment(
  appointmentId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { remove: (id: string) => Promise<boolean>; removeIncome: (id: string) => Promise<void> },
): Promise<AppointmentResult<AccessError | "appointment_not_found">> {
  const accessError = checkAccess(ctx.actor, "bookings.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!appointmentId) return { ok: false, error: "appointment_not_found" };

  if (!(await deps.remove(appointmentId))) return { ok: false, error: "appointment_not_found" };
  await deps.removeIncome(appointmentId);
  return { ok: true };
}
