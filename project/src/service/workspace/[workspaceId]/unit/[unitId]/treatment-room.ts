// Espaços da unidade (salas, hidromassagem...): beds é quantos atendimentos o espaço comporta ao mesmo tempo.

const MAX_ROOMS = 20;
const MAX_NAME_LENGTH = 40;
const MAX_BEDS = 10;

// id null = sala nova, ainda sem id.
export type TreatmentRoomInput = { id: string | null; name: string; beds: number };

export type TreatmentRoomError =
  | "invalid_input"
  | "no_treatment_rooms"
  | "too_many_treatment_rooms"
  | "invalid_treatment_room_name"
  | "treatment_room_name_too_long"
  | "duplicate_treatment_room_name"
  | "invalid_treatment_room_beds";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Valida os campos como chegam do formulário: uma posição por sala em cada lista.
export function parseTreatmentRooms(
  input: unknown,
): { ok: true; value: TreatmentRoomInput[] } | { ok: false; error: TreatmentRoomError } {
  const { ids, names, beds } = (input ?? {}) as Record<string, unknown>;
  if (!isStringArray(ids) || !isStringArray(names) || !isStringArray(beds)) return { ok: false, error: "invalid_input" };
  if (ids.length !== names.length || beds.length !== names.length) return { ok: false, error: "invalid_input" };

  const normalizedIds = ids.map((id) => id.trim());
  const existingIds = normalizedIds.filter(Boolean);
  if (existingIds.some((id) => !/^[0-9a-f]{24}$/i.test(id)) || new Set(existingIds).size !== existingIds.length) {
    return { ok: false, error: "invalid_input" };
  }

  if (!names.length) return { ok: false, error: "no_treatment_rooms" };
  if (names.length > MAX_ROOMS) return { ok: false, error: "too_many_treatment_rooms" };

  const rooms: TreatmentRoomInput[] = [];
  const seenNames = new Set<string>();
  for (const [i, value] of names.entries()) {
    const name = value.trim();
    if (!name) return { ok: false, error: "invalid_treatment_room_name" };
    if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "treatment_room_name_too_long" };
    const key = name.toLowerCase();
    if (seenNames.has(key)) return { ok: false, error: "duplicate_treatment_room_name" };
    seenNames.add(key);

    const count = beds[i].trim();
    if (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > MAX_BEDS) {
      return { ok: false, error: "invalid_treatment_room_beds" };
    }
    rooms.push({ id: normalizedIds[i] || null, name, beds: Number(count) });
  }

  return { ok: true, value: rooms };
}

type Interval = { startsAt: Date; endsAt: Date };

// Maior número de agendamentos simultâneos dentro do intervalo; quem só encosta
// no início ou no fim não conta.
export function peakOccupancy(bookings: readonly Interval[], { startsAt, endsAt }: Interval) {
  const events: [number, number][] = [];
  for (const booking of bookings) {
    const start = Math.max(booking.startsAt.getTime(), startsAt.getTime());
    const end = Math.min(booking.endsAt.getTime(), endsAt.getTime());
    if (start < end) events.push([start, 1], [end, -1]);
  }
  // No mesmo instante, a saída vem antes da entrada.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}
