import { describe, it, expect } from "vitest";
import { availableSlots } from "@/service/workspace/[workspaceId]/uras/ura-slots";

const ANA = { id: "therapist-ana", name: "Ana" };
const BIA = { id: "therapist-bia", name: "Bia" };
const SALA_1 = { id: "room-1", name: "Sala 1", beds: 1 };
const SALA_2 = { id: "room-2", name: "Sala 2", beds: 1 };

// Segunda, 28/09/2026, 09:00 em Brasília.
const FROM = new Date("2026-09-28T12:00:00.000Z");
const hours = { opensAt: "09:00", closesAt: "12:00" };

// Ana atende das 10:00 às 11:00 (Brasília) na Sala 1.
const anaBooked = {
  therapistId: ANA.id,
  roomId: SALA_1.id,
  startsAt: new Date("2026-09-28T13:00:00.000Z"),
  endsAt: new Date("2026-09-28T14:00:00.000Z"),
};

function slot(iso: string, therapist = ANA, room = SALA_1) {
  return {
    startsAt: new Date(iso),
    therapistId: therapist.id,
    therapistName: therapist.name,
    roomId: room.id,
    roomName: room.name,
  };
}

describe("availableSlots", () => {
  it("oferece horários de 30 em 30 minutos dentro do expediente, com antecedência mínima de 1h", () => {
    const slots = availableSlots({
      from: FROM,
      days: 2,
      durationMinutes: 60,
      businessHours: hours,
      therapists: [ANA, BIA],
      rooms: [SALA_1],
      bookings: [anaBooked],
    });

    expect(slots).toEqual([
      // 10:00 e 10:30 ficam de fora: a única maca da Sala 1 está ocupada até 11:00.
      // 11:30 não cabe: terminaria depois do fechamento.
      slot("2026-09-28T14:00:00.000Z"),
      slot("2026-09-29T12:00:00.000Z"),
      slot("2026-09-29T12:30:00.000Z"),
      slot("2026-09-29T13:00:00.000Z"),
      slot("2026-09-29T13:30:00.000Z"),
      slot("2026-09-29T14:00:00.000Z"),
    ]);
  });

  it("escolhe o primeiro profissional livre e a primeira sala com maca livre", () => {
    const slots = availableSlots({
      from: FROM,
      days: 1,
      durationMinutes: 60,
      businessHours: hours,
      therapists: [ANA, BIA],
      rooms: [SALA_1, SALA_2],
      bookings: [anaBooked],
    });

    expect(slots).toEqual([
      slot("2026-09-28T13:00:00.000Z", BIA, SALA_2),
      slot("2026-09-28T13:30:00.000Z", BIA, SALA_2),
      slot("2026-09-28T14:00:00.000Z", ANA, SALA_1),
    ]);
  });

  it("usa outra maca da mesma sala quando ela tem mais de uma", () => {
    const sala = { ...SALA_1, beds: 2 };
    const slots = availableSlots({
      from: FROM,
      days: 1,
      durationMinutes: 60,
      businessHours: hours,
      therapists: [ANA, BIA],
      rooms: [sala],
      bookings: [anaBooked],
    });

    expect(slots[0]).toEqual(slot("2026-09-28T13:00:00.000Z", BIA, sala));
  });

  it("respeita o limite de horários, o passo e a antecedência informados", () => {
    const slots = availableSlots({
      from: FROM,
      days: 3,
      durationMinutes: 30,
      businessHours: hours,
      therapists: [BIA],
      rooms: [SALA_1],
      bookings: [],
      stepMinutes: 60,
      leadMinutes: 0,
      limit: 2,
    });

    expect(slots).toEqual([slot("2026-09-28T12:00:00.000Z", BIA), slot("2026-09-28T13:00:00.000Z", BIA)]);
  });

  it("aceita fechamento à meia-noite", () => {
    const slots = availableSlots({
      from: new Date("2026-09-29T01:00:00.000Z"), // 22:00 em Brasília
      days: 1,
      durationMinutes: 60,
      businessHours: { opensAt: "20:00", closesAt: "24:00" },
      therapists: [BIA],
      rooms: [SALA_1],
      bookings: [],
      leadMinutes: 0,
    });

    expect(slots).toEqual([slot("2026-09-29T01:00:00.000Z", BIA), slot("2026-09-29T01:30:00.000Z", BIA), slot("2026-09-29T02:00:00.000Z", BIA)]);
  });

  it("não oferece nada sem profissionais ou sem salas", () => {
    const base = { from: FROM, days: 2, durationMinutes: 60, businessHours: hours, bookings: [] };
    expect(availableSlots({ ...base, therapists: [], rooms: [SALA_1] })).toEqual([]);
    expect(availableSlots({ ...base, therapists: [ANA], rooms: [] })).toEqual([]);
  });
});
