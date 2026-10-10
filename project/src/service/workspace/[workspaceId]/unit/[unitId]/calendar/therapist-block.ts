import { parsePerformedAt } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment";

// Agenda travada: o profissional não atende no intervalo (folga, consulta...), em nenhuma unidade.

const MAX_REASON_LENGTH = 120;
const MAX_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TherapistBlockError =
  | "invalid_input"
  | "invalid_therapist"
  | "invalid_start"
  | "invalid_end"
  | "invalid_block_period"
  | "block_too_long"
  | "reason_too_long"
  | "therapist_not_found"
  | "therapist_has_bookings"
  | "block_not_found";

export type TherapistBlockData = {
  therapistId: string;
  therapistName: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
};

type Interval = { therapistId: string; startsAt: Date; endsAt: Date };

const isOptionalString = (value: unknown) => value == null || typeof value === "string";

// Dia inteiro começa à meia-noite; fora dele, a hora vem do formulário. null se inválido.
function wallTime(day: string, time: unknown, allDay: boolean) {
  if (allDay) return parsePerformedAt(`${day.trim()}T00:00`);
  return typeof time === "string" ? parsePerformedAt(`${day.trim()}T${time.trim()}`) : null;
}

export type CreateTherapistBlockResult = { ok: true; blockId: string } | { ok: false; error: TherapistBlockError };

// Campos como chegam do FormData: dias e horas de Brasília; com allDay, vai da meia-noite do
// primeiro dia à meia-noite depois do último. Não trava por cima de agendamentos existentes.
export async function createTherapistBlock(
  input: unknown,
  {
    findTherapist,
    hasBookings,
    insert,
  }: {
    // Quem pode atender no workspace; null quando não pode.
    findTherapist: (id: string) => Promise<{ id: string; name: string } | null>;
    // true quando o profissional tem algum agendamento que se sobrepõe ao intervalo.
    hasBookings: (interval: Interval) => Promise<boolean>;
    insert: (data: TherapistBlockData) => Promise<{ id: string }>;
  },
): Promise<CreateTherapistBlockResult> {
  const { therapistId, startDay, endDay, allDay, startTime, endTime, reason } = (input ?? {}) as Record<string, unknown>;
  if (
    typeof therapistId !== "string" ||
    typeof startDay !== "string" ||
    typeof endDay !== "string" ||
    !isOptionalString(startTime) ||
    !isOptionalString(endTime) ||
    !isOptionalString(reason)
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedTherapistId = therapistId.trim();
  if (!normalizedTherapistId) return { ok: false, error: "invalid_therapist" };

  const wholeDay = allDay === "on";
  const start = wallTime(startDay, startTime, wholeDay);
  if (!start) return { ok: false, error: "invalid_start" };
  const lastDay = wallTime(endDay, endTime, wholeDay);
  if (!lastDay) return { ok: false, error: "invalid_end" };
  const end = wholeDay ? new Date(lastDay.getTime() + DAY_MS) : lastDay;
  if (end <= start) return { ok: false, error: "invalid_block_period" };
  if (end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) return { ok: false, error: "block_too_long" };

  const normalizedReason = (reason as string | null | undefined)?.trim() || null;
  if (normalizedReason && normalizedReason.length > MAX_REASON_LENGTH) return { ok: false, error: "reason_too_long" };

  const therapist = await findTherapist(normalizedTherapistId);
  if (!therapist) return { ok: false, error: "therapist_not_found" };
  if (await hasBookings({ therapistId: therapist.id, startsAt: start, endsAt: end })) {
    return { ok: false, error: "therapist_has_bookings" };
  }

  const block = await insert({
    therapistId: therapist.id,
    therapistName: therapist.name,
    startsAt: start,
    endsAt: end,
    reason: normalizedReason,
  });
  return { ok: true, blockId: block.id };
}

export type TherapistBlockResult = { ok: true } | { ok: false; error: TherapistBlockError };

// remove devolve false quando a trava não existe (ou não é do workspace).
export async function deleteTherapistBlock(
  blockId: string | null | undefined,
  remove: (blockId: string) => Promise<boolean>,
): Promise<TherapistBlockResult> {
  if (!blockId) return { ok: false, error: "block_not_found" };

  const found = await remove(blockId);
  return found ? { ok: true } : { ok: false, error: "block_not_found" };
}
