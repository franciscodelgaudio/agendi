import { describe, it, expect, vi } from "vitest";
import { bookingAppointmentInput, convertBooking } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/booking-convert";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const BOOKING_ID = "64b7f0c2a1b2c3d4e5f60740";
const APPOINTMENT_ID = "64b7f0c2a1b2c3d4e5f60760";
const CANDLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const OIL_ID = "64b7f0c2a1b2c3d4e5f60761";

// O formulário de atendimento chega pré-preenchido com os dados do agendamento e pode ter
// sido ajustado; é validado como qualquer atendimento.
const validInput = {
  guestName: "João Silva",
  room: "204",
  performedAt: "2026-09-24T14:30",
  serviceIds: [CANDLE_ID],
  therapistIds: [ANA_ID],
};

function makeDeps({
  booking = { appointmentId: null } as { appointmentId: string | null } | null,
  linked = true,
} = {}) {
  return {
    // Devolve null quando o agendamento não existe (ou não é do workspace).
    findBooking: vi.fn().mockResolvedValue(booking),
    findServices: vi.fn(async (ids: string[]) =>
      ids.includes(CANDLE_ID) ? [{ id: CANDLE_ID, name: "Massagem Candle", priceCents: 35000, durationMinutes: 60 }] : [],
    ),
    findTherapists: vi.fn(async (ids: string[]) => (ids.includes(ANA_ID) ? [{ id: ANA_ID, name: "Ana" }] : [])),
    findProducts: vi.fn(async (ids: string[]) =>
      ids.includes(OIL_ID) ? [{ id: OIL_ID, name: "Óleo de amêndoas" }] : [],
    ),
    insert: vi.fn().mockResolvedValue({ id: APPOINTMENT_ID }),
    // Liga o atendimento ao agendamento só se ele ainda não tiver um; false se outro chegou antes.
    link: vi.fn().mockResolvedValue(linked),
    removeAppointment: vi.fn().mockResolvedValue(undefined),
  };
}

describe("convertBooking", () => {
  // Os produtos do agendamento vêm pré-preenchidos no formulário e são validados como no atendimento.
  it("leva os produtos do formulário para o atendimento", async () => {
    const deps = makeDeps();

    await convertBooking({ ...validInput, productIds: [OIL_ID] }, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(deps.insert.mock.calls[0][0].products).toEqual([{ productId: OIL_ID, productName: "Óleo de amêndoas" }]);
  });

  it("cria o atendimento na unidade e o liga ao agendamento", async () => {
    const deps = makeDeps();

    const result = await convertBooking(validInput, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.findBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(deps.insert).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      performedAt: new Date("2026-09-24T17:30:00.000Z"),
      guest: { name: "João Silva", room: "204" },
      items: [
        {
          serviceId: CANDLE_ID,
          serviceName: "Massagem Candle",
          priceCents: 35000,
          durationMinutes: 60,
          therapistId: ANA_ID,
          therapistName: "Ana",
        },
      ],
      products: [],
    });
    expect(deps.link).toHaveBeenCalledWith(BOOKING_ID, APPOINTMENT_ID);
    expect(deps.removeAppointment).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna booking_not_found sem buscar nem salvar quando não há bookingId (%j)",
    async (bookingId) => {
      const deps = makeDeps();

      const result = await convertBooking(validInput, { bookingId, unitId: UNIT_ID }, deps);

      expect(result).toEqual({ ok: false, error: "booking_not_found" });
      expect(deps.findBooking).not.toHaveBeenCalled();
      expect(deps.insert).not.toHaveBeenCalled();
    },
  );

  it("retorna booking_not_found sem salvar quando o agendamento não existe", async () => {
    const deps = makeDeps({ booking: null });

    const result = await convertBooking(validInput, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.link).not.toHaveBeenCalled();
  });

  it("retorna booking_already_converted sem salvar quando o agendamento já virou atendimento", async () => {
    const deps = makeDeps({ booking: { appointmentId: "64b7f0c2a1b2c3d4e5f60799" } });

    const result = await convertBooking(validInput, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(result).toEqual({ ok: false, error: "booking_already_converted" });
    expect(deps.findServices).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem serviço (agendamento sem serviço e formulário não preenchido)", { ...validInput, serviceIds: [""] }, "invalid_item"],
    ["nenhum serviço", { ...validInput, serviceIds: [], therapistIds: [] }, "no_items"],
    ["hóspede vazio", { ...validInput, guestName: " " }, "invalid_guest_name"],
    ["data/hora inválida", { ...validInput, performedAt: "2026-02-30T10:00" }, "invalid_performed_at"],
    ["serviço de outra unidade", { ...validInput, serviceIds: ["64b7f0c2a1b2c3d4e5f60739"] }, "service_not_found"],
  ])("repassa o erro de validação do atendimento sem salvar nem ligar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await convertBooking(input, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.link).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna unit_not_found sem salvar quando não há unitId (%j)", async (unitId) => {
    const deps = makeDeps();

    const result = await convertBooking(validInput, { bookingId: BOOKING_ID, unitId }, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.link).not.toHaveBeenCalled();
  });

  it("desfaz o atendimento criado e retorna booking_already_converted quando outra conversão ligou antes", async () => {
    const deps = makeDeps({ linked: false });

    const result = await convertBooking(validInput, { bookingId: BOOKING_ID, unitId: UNIT_ID }, deps);

    expect(result).toEqual({ ok: false, error: "booking_already_converted" });
    expect(deps.removeAppointment).toHaveBeenCalledWith(APPOINTMENT_ID);
  });
});

// Registro com um clique: o atendimento sai dos dados salvos no agendamento, no mesmo formato
// do formulário, para ser validado como qualquer atendimento.
describe("bookingAppointmentInput", () => {
  const booking = {
    guest: { name: "João Silva", room: "204" },
    startsAt: new Date("2026-09-24T17:30:00.000Z"),
    endsAt: new Date("2026-09-24T19:00:00.000Z"),
    service: { serviceId: CANDLE_ID },
    therapistId: ANA_ID,
    products: [{ productId: OIL_ID }],
  };

  it("usa hóspede, horário de Brasília, serviço, profissional, produtos e a duração do agendamento", () => {
    expect(bookingAppointmentInput(booking)).toEqual({
      guestName: "João Silva",
      room: "204",
      performedAt: "2026-09-24T14:30",
      serviceIds: [CANDLE_ID],
      therapistIds: [ANA_ID],
      durations: ["90"],
      productIds: [OIL_ID],
    });
  });

  it("converte para o dia de Brasília quando o horário em UTC já é do dia seguinte", () => {
    const input = bookingAppointmentInput({
      ...booking,
      startsAt: new Date("2026-09-25T01:30:00.000Z"),
      endsAt: new Date("2026-09-25T02:20:00.000Z"),
    });

    expect(input.performedAt).toBe("2026-09-24T22:30");
    expect(input.durations).toEqual(["50"]);
  });

  it("registra o atendimento com a duração do agendamento, não a do cadastro do serviço", async () => {
    const deps = makeDeps();

    const result = await convertBooking(
      bookingAppointmentInput({ ...booking, products: [] }),
      { bookingId: BOOKING_ID, unitId: UNIT_ID },
      deps,
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      performedAt: new Date("2026-09-24T17:30:00.000Z"),
      guest: { name: "João Silva", room: "204" },
      items: [
        {
          serviceId: CANDLE_ID,
          serviceName: "Massagem Candle",
          priceCents: 35000,
          durationMinutes: 90,
          therapistId: ANA_ID,
          therapistName: "Ana",
        },
      ],
      products: [],
    });
  });
});
