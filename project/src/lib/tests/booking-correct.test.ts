import { describe, it, expect, vi } from "vitest";
import {
  correctRegisteredBooking,
  rescheduleBooking,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking";

// Agendamento que já virou atendimento continua corrigível no calendário: horário, duração,
// hóspede, quarto, espaço e cor. Serviço, profissional e produtos ficam com o atendimento.

const BOOKING_ID = "64b7f0c2a1b2c3d4e5f60740";
const CANDLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const BIA_ID = "64b7f0c2a1b2c3d4e5f60752";
const OIL_ID = "64b7f0c2a1b2c3d4e5f60761";
const OTHER_SERVICE_ID = "64b7f0c2a1b2c3d4e5f60739";
const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const COUPLE_ID = "64b7f0c2a1b2c3d4e5f60782";
const SINGLE = { id: SINGLE_ID, name: "Sala Single", beds: 1 };
const COUPLE = { id: COUPLE_ID, name: "Sala Casal", beds: 2 };
const ROOMS = [SINGLE, COUPLE];

// Horário de 24/09/2026 em Brasília ("14:30") como Date em UTC.
function at(time: string) {
  return new Date(`2026-09-24T${time}:00.000-03:00`);
}

// Como chega do FormData; o agendamento salvo é das 14:30, com 60 minutos.
const validInput = {
  guestName: "Maria Souza",
  room: "310",
  startsAt: "2026-09-24T16:00",
  durationMinutes: "45",
  treatmentRoomId: COUPLE_ID,
  color: "#7c3aed",
};

type RegisteredBooking = { therapistId: string | null; serviceId: string; durationMinutes: number; serviceCount: number };

describe("correctRegisteredBooking", () => {
  function makeDeps({
    booking = { therapistId: ANA_ID, serviceId: CANDLE_ID, durationMinutes: 60, serviceCount: 1 } as RegisteredBooking | null,
    treatmentRoomIds = [] as string[],
    serviceFound = true,
    busy = false,
    blocked = false,
    roomBookings = [] as { startsAt: Date; endsAt: Date }[],
    found = true,
  } = {}) {
    return {
      // null quando não existe (ou não é do workspace) ou ainda não virou atendimento.
      findBooking: vi.fn().mockResolvedValue(booking),
      // Serviço do agendamento, para os espaços permitidos; null se foi removido da unidade.
      findService: vi.fn(async (id: string) =>
        serviceFound ? { id, name: "Massagem Candle", requiresTherapist: true, treatmentRoomIds } : null,
      ),
      findTreatmentRoom: vi.fn(async (id: string) => ROOMS.find((room) => room.id === id) ?? null),
      hasConflict: vi.fn().mockResolvedValue(busy),
      isBlocked: vi.fn().mockResolvedValue(blocked),
      findRoomBookings: vi.fn().mockResolvedValue(roomBookings),
      update: vi.fn().mockResolvedValue(found),
    };
  }

  it("corrige o agendamento e leva horário, duração e hóspede para o atendimento", async () => {
    const deps = makeDeps();

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(deps.update).toHaveBeenCalledWith(
      BOOKING_ID,
      {
        guest: { name: "Maria Souza", room: "310" },
        startsAt: at("16:00"),
        endsAt: at("16:45"),
        treatmentRoom: { roomId: COUPLE_ID, roomName: "Sala Casal" },
        color: "#7c3aed",
      },
      { performedAt: at("16:00"), guest: { name: "Maria Souza", room: "310" }, durationMinutes: 45 },
    );
  });

  it("ignora serviço, profissional e produtos enviados no formulário", async () => {
    const deps = makeDeps();

    await correctRegisteredBooking(
      { ...validInput, serviceId: OTHER_SERVICE_ID, therapistId: BIA_ID, productIds: [OIL_ID] },
      BOOKING_ID,
      deps,
    );

    const [, fields] = deps.update.mock.calls[0];
    expect(Object.keys(fields).sort()).toEqual(["color", "endsAt", "guest", "startsAt", "treatmentRoom"]);
    expect(deps.findService).toHaveBeenCalledWith(CANDLE_ID);
  });

  it("confere trava e conflito do profissional do agendamento, ignorando o próprio agendamento", async () => {
    const deps = makeDeps();

    await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(deps.isBlocked).toHaveBeenCalledWith({ therapistId: ANA_ID, startsAt: at("16:00"), endsAt: at("16:45") });
    expect(deps.hasConflict).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      startsAt: at("16:00"),
      endsAt: at("16:45"),
      excludeId: BOOKING_ID,
    });
    expect(deps.findRoomBookings).toHaveBeenCalledWith({
      treatmentRoomId: COUPLE_ID,
      startsAt: at("16:00"),
      endsAt: at("16:45"),
      excludeId: BOOKING_ID,
    });
  });

  it("não mexe na duração do atendimento quando ela não muda", async () => {
    const deps = makeDeps();

    await correctRegisteredBooking({ ...validInput, durationMinutes: "60" }, BOOKING_ID, deps);

    expect(deps.update.mock.calls[0][2]).toEqual({
      performedAt: at("16:00"),
      guest: { name: "Maria Souza", room: "310" },
      durationMinutes: null,
    });
  });

  it("com vários serviços no atendimento, retorna duration_locked sem checar nem salvar ao mudar a duração", async () => {
    const deps = makeDeps({
      booking: { therapistId: ANA_ID, serviceId: CANDLE_ID, durationMinutes: 60, serviceCount: 2 },
    });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "duration_locked" });
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.findRoomBookings).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("com vários serviços no atendimento, corrige o horário mantendo a duração", async () => {
    const deps = makeDeps({
      booking: { therapistId: ANA_ID, serviceId: CANDLE_ID, durationMinutes: 60, serviceCount: 2 },
    });

    const result = await correctRegisteredBooking({ ...validInput, durationMinutes: "60" }, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update.mock.calls[0][2]).toEqual({
      performedAt: at("16:00"),
      guest: { name: "Maria Souza", room: "310" },
      durationMinutes: null,
    });
  });

  it("não confere trava nem conflito de profissional quando o agendamento não tem", async () => {
    const deps = makeDeps({
      booking: { therapistId: null, serviceId: CANDLE_ID, durationMinutes: 60, serviceCount: 1 },
    });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.isBlocked).not.toHaveBeenCalled();
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.findRoomBookings).toHaveBeenCalled();
  });

  it("retorna booking_not_found sem checar nem salvar quando o agendamento não existe ou não virou atendimento", async () => {
    const deps = makeDeps({ booking: null });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("retorna booking_not_found para bookingId %j", async (bookingId) => {
    const deps = makeDeps();

    const result = await correctRegisteredBooking(validInput, bookingId, deps);

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
    expect(deps.findBooking).not.toHaveBeenCalled();
  });

  it("retorna booking_not_found quando o agendamento some antes de salvar", async () => {
    const result = await correctRegisteredBooking(validInput, BOOKING_ID, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
  });

  it.each([
    [{ guestName: "  " }, "invalid_guest_name"],
    [{ guestName: "a".repeat(81) }, "guest_name_too_long"],
    [{ room: "" }, "invalid_room"],
    [{ room: "a".repeat(21) }, "room_too_long"],
    [{ startsAt: "24/09/2026" }, "invalid_starts_at"],
    [{ durationMinutes: "4" }, "invalid_duration"],
    [{ treatmentRoomId: " " }, "invalid_treatment_room"],
    [{ color: "#123456" }, "invalid_color"],
  ])("valida o formulário: %j retorna %s sem salvar", async (change, error) => {
    const deps = makeDeps();

    const result = await correctRegisteredBooking({ ...validInput, ...change }, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna treatment_room_not_found sem salvar quando o espaço não é da unidade", async () => {
    const deps = makeDeps();

    const result = await correctRegisteredBooking(
      { ...validInput, treatmentRoomId: "64b7f0c2a1b2c3d4e5f60789" },
      BOOKING_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "treatment_room_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna treatment_room_not_allowed sem salvar quando o serviço do agendamento não usa o espaço", async () => {
    const deps = makeDeps({ treatmentRoomIds: [SINGLE_ID] });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "treatment_room_not_allowed" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("aceita qualquer espaço da unidade quando o serviço do agendamento foi removido", async () => {
    const result = await correctRegisteredBooking(validInput, BOOKING_ID, makeDeps({ serviceFound: false }));

    expect(result).toEqual({ ok: true });
  });

  it("retorna therapist_unavailable sem salvar quando a agenda do profissional está travada", async () => {
    const deps = makeDeps({ blocked: true });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_unavailable" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna therapist_busy sem salvar quando o profissional tem outro agendamento no horário", async () => {
    const deps = makeDeps({ busy: true });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_busy" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna room_full sem salvar quando o espaço está lotado no horário", async () => {
    const busyRoom = [
      { startsAt: at("15:30"), endsAt: at("17:00") },
      { startsAt: at("16:00"), endsAt: at("16:30") },
    ];
    const deps = makeDeps({ roomBookings: busyRoom });

    const result = await correctRegisteredBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "room_full" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

// Arrastar ou redimensionar um agendamento que já virou atendimento: recusado, como na tela.
// A correção de um atendimento registrado é só pelo formulário (correctRegisteredBooking).
describe("rescheduleBooking de agendamento registrado", () => {
  function makeDeps() {
    return {
      findBooking: vi.fn().mockResolvedValue({
        therapistId: ANA_ID,
        treatmentRoom: { roomId: SINGLE_ID, beds: 1 },
        registered: true,
      }),
      hasConflict: vi.fn().mockResolvedValue(false),
      isBlocked: vi.fn().mockResolvedValue(false),
      findRoomBookings: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(true),
    };
  }

  it.each([
    ["move e redimensiona", { startsAt: "2026-09-24T15:00", endsAt: "2026-09-24T16:30" }],
    ["só move", { startsAt: "2026-09-24T15:00", endsAt: "2026-09-24T16:00" }],
  ])("%s: retorna booking_registered sem checar a agenda nem salvar", async (_label, times) => {
    const deps = makeDeps();

    const result = await rescheduleBooking(times, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "booking_registered" });
    expect(deps.isBlocked).not.toHaveBeenCalled();
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.findRoomBookings).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});
