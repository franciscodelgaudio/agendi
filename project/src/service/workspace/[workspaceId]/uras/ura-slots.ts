import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours";
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone";
import { peakOccupancy } from "@/service/workspace/[workspaceId]/unit/[unitId]/treatment-room";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * MINUTE_MS;

export type AvailableSlot = {
  startsAt: Date;
  therapistId: string;
  therapistName: string;
  roomId: string;
  roomName: string;
};

type Busy = { therapistId: string; roomId: string; startsAt: Date; endsAt: Date };

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const overlaps = (a: { startsAt: Date; endsAt: Date }, start: number, end: number) =>
  a.startsAt.getTime() < end && a.endsAt.getTime() > start;

// Horários em que dá para marcar o serviço: dentro do expediente, a partir de `from`
// mais a antecedência, com algum profissional livre e alguma sala com maca livre.
// Cada horário leva o primeiro profissional e a primeira sala disponíveis, na ordem dada.
export function availableSlots({
  from,
  days,
  durationMinutes,
  businessHours,
  therapists,
  rooms,
  bookings,
  stepMinutes = 30,
  leadMinutes = 60,
  limit = 10,
}: {
  from: Date;
  days: number;
  durationMinutes: number;
  businessHours: BusinessHours;
  therapists: readonly { id: string; name: string }[];
  rooms: readonly { id: string; name: string; beds: number }[];
  bookings: readonly Busy[];
  stepMinutes?: number;
  leadMinutes?: number;
  limit?: number;
}): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  if (!therapists.length || !rooms.length) return slots;

  const earliest = from.getTime() + leadMinutes * MINUTE_MS;
  const duration = durationMinutes * MINUTE_MS;
  const opens = minutesOf(businessHours.opensAt);
  const closes = minutesOf(businessHours.closesAt);
  // Meia-noite (UTC) do dia de `from` em Brasília, convertida de volta para o instante real.
  const brtFrom = new Date(from.getTime() - BRT_OFFSET_MS);
  const firstDay = Date.UTC(brtFrom.getUTCFullYear(), brtFrom.getUTCMonth(), brtFrom.getUTCDate()) + BRT_OFFSET_MS;

  for (let day = 0; day < days; day++) {
    const midnight = firstDay + day * DAY_MS;
    for (let minute = opens; minute + durationMinutes <= closes; minute += stepMinutes) {
      const start = midnight + minute * MINUTE_MS;
      if (start < earliest) continue;
      const end = start + duration;
      const busy = bookings.filter((b) => overlaps(b, start, end));

      const therapist = therapists.find((t) => !busy.some((b) => b.therapistId === t.id));
      if (!therapist) continue;
      const interval = { startsAt: new Date(start), endsAt: new Date(end) };
      const room = rooms.find((r) => peakOccupancy(busy.filter((b) => b.roomId === r.id), interval) < r.beds);
      if (!room) continue;

      slots.push({
        startsAt: new Date(start),
        therapistId: therapist.id,
        therapistName: therapist.name,
        roomId: room.id,
        roomName: room.name,
      });
      if (slots.length >= limit) return slots;
    }
  }
  return slots;
}
