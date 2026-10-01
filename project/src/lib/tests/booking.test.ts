import { describe, it, expect, vi } from "vitest";
import { createBooking, deleteBooking, rescheduleBooking, updateBooking } from "@/lib/booking";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const BOOKING_ID = "64b7f0c2a1b2c3d4e5f60740";
const CANDLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";

const CANDLE = { id: CANDLE_ID, name: "Massagem Candle" };
const ANA = { id: ANA_ID, name: "Ana" };
const OIL_ID = "64b7f0c2a1b2c3d4e5f60761";
const TOWEL_ID = "64b7f0c2a1b2c3d4e5f60762";
const OTHER_UNIT_PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60769";
const PRODUCTS = [
  { id: OIL_ID, name: "Óleo de amêndoas" },
  { id: TOWEL_ID, name: "Toalha" },
];
// Salas da unidade: a single atende um por vez; a casal, dois ao mesmo tempo.
const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const COUPLE_ID = "64b7f0c2a1b2c3d4e5f60782";
const SINGLE = { id: SINGLE_ID, name: "Sala Single", beds: 1 };
const COUPLE = { id: COUPLE_ID, name: "Sala Casal", beds: 2 };

// Como chega do FormData: início no horário de Brasília e duração em minutos (texto).
const validInput = {
  therapistId: ANA_ID,
  guestName: "João Silva",
  room: "204",
  startsAt: "2026-09-24T14:30",
  durationMinutes: "60",
  serviceId: CANDLE_ID,
  treatmentRoomId: SINGLE_ID,
};

// Horário de 24/09/2026 em Brasília ("14:30") como Date em UTC.
function at(time: string) {
  return new Date(`2026-09-24T${time}:00.000-03:00`);
}

type RoomBooking = { startsAt: Date; endsAt: Date };

function makeLookups({
  service = CANDLE as typeof CANDLE | null,
  therapist = ANA as typeof ANA | null,
  busy = false,
  room = SINGLE as typeof SINGLE | null,
  roomBookings = [] as readonly RoomBooking[],
} = {}) {
  return {
    // Devolvem null quando não existe (serviço da unidade; quem pode atender no workspace).
    findService: vi.fn(async (id: string) => (service?.id === id ? service : null)),
    findTherapist: vi.fn(async (id: string) => (therapist?.id === id ? therapist : null)),
    // true quando o profissional já tem outro agendamento que se sobrepõe ao intervalo.
    hasConflict: vi.fn(async () => busy),
    // Sala da unidade, ou null quando não existe nela.
    findTreatmentRoom: vi.fn(async (id: string) => (room?.id === id ? room : null)),
    // Outros agendamentos da sala que se sobrepõem ao intervalo.
    findRoomBookings: vi.fn(async () => roomBookings),
    // Devolve só os produtos que existem na unidade.
    findProducts: vi.fn(async (ids: string[]) => PRODUCTS.filter((p) => ids.includes(p.id))),
  };
}

describe("createBooking", () => {
  function makeDeps(options?: Parameters<typeof makeLookups>[0]) {
    return { ...makeLookups(options), insert: vi.fn().mockResolvedValue({ id: BOOKING_ID }) };
  }

  it("cria o agendamento com início/fim em UTC, profissional e cópia do nome do serviço", async () => {
    const deps = makeDeps();

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, bookingId: BOOKING_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      therapistId: ANA_ID,
      therapistName: "Ana",
      guest: { name: "João Silva", room: "204" },
      startsAt: new Date("2026-09-24T17:30:00.000Z"),
      endsAt: new Date("2026-09-24T18:30:00.000Z"),
      service: { serviceId: CANDLE_ID, serviceName: "Massagem Candle" },
      treatmentRoom: { roomId: SINGLE_ID, roomName: "Sala Single" },
      products: [],
      color: null,
    });
  });

  it("verifica conflito do profissional no intervalo do agendamento", async () => {
    const deps = makeDeps();

    await createBooking(validInput, UNIT_ID, deps);

    expect(deps.hasConflict).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      startsAt: new Date("2026-09-24T17:30:00.000Z"),
      endsAt: new Date("2026-09-24T18:30:00.000Z"),
    });
  });

  it("remove espaços das pontas de hóspede, quarto, início, duração e ids", async () => {
    const deps = makeDeps();

    await createBooking(
      {
        therapistId: ` ${ANA_ID} `,
        guestName: "  João Silva  ",
        room: " 204 ",
        startsAt: " 2026-09-24T14:30 ",
        durationMinutes: " 60 ",
        serviceId: ` ${CANDLE_ID} `,
        treatmentRoomId: ` ${SINGLE_ID} `,
      },
      UNIT_ID,
      deps,
    );

    expect(deps.findService).toHaveBeenCalledWith(CANDLE_ID);
    expect(deps.findTherapist).toHaveBeenCalledWith(ANA_ID);
    expect(deps.findTreatmentRoom).toHaveBeenCalledWith(SINGLE_ID);
    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        therapistId: ANA_ID,
        guest: { name: "João Silva", room: "204" },
        startsAt: new Date("2026-09-24T17:30:00.000Z"),
      }),
    );
  });

  it("converte de Brasília para UTC e permite terminar no dia seguinte", async () => {
    const deps = makeDeps();

    await createBooking({ ...validInput, startsAt: "2026-12-31T22:15", durationMinutes: "90" }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        startsAt: new Date("2027-01-01T01:15:00.000Z"),
        endsAt: new Date("2027-01-01T02:45:00.000Z"),
      }),
    );
  });

  it.each(["5", "720"])("aceita duração de %s minutos (limites)", async (durationMinutes) => {
    const result = await createBooking({ ...validInput, durationMinutes }, UNIT_ID, makeDeps());

    expect(result).toEqual({ ok: true, bookingId: BOOKING_ID });
  });

  it("aceita nome do hóspede com 80 caracteres e quarto com 20 (limites)", async () => {
    const result = await createBooking(
      { ...validInput, guestName: "a".repeat(80), room: "1".repeat(20) },
      UNIT_ID,
      makeDeps(),
    );

    expect(result).toEqual({ ok: true, bookingId: BOOKING_ID });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["profissional não é string", { ...validInput, therapistId: 1 }, "invalid_input"],
    ["hóspede ausente (null do FormData)", { ...validInput, guestName: null }, "invalid_input"],
    ["quarto ausente", { ...validInput, room: undefined }, "invalid_input"],
    ["início ausente", { ...validInput, startsAt: null }, "invalid_input"],
    ["duração ausente", { ...validInput, durationMinutes: null }, "invalid_input"],
    ["serviço não é string", { ...validInput, serviceId: 123 }, "invalid_input"],
    ["serviço ausente (null do FormData)", { ...validInput, serviceId: null }, "invalid_input"],
    ["sala ausente (null do FormData)", { ...validInput, treatmentRoomId: null }, "invalid_input"],
    ["profissional não escolhido", { ...validInput, therapistId: "  " }, "invalid_therapist"],
    ["serviço vazio", { ...validInput, serviceId: "" }, "invalid_service"],
    ["serviço não escolhido", { ...validInput, serviceId: "   " }, "invalid_service"],
    ["sala não escolhida", { ...validInput, treatmentRoomId: "  " }, "invalid_treatment_room"],
    ["nome do hóspede vazio", { ...validInput, guestName: "   " }, "invalid_guest_name"],
    ["nome do hóspede com mais de 80 caracteres", { ...validInput, guestName: "a".repeat(81) }, "guest_name_too_long"],
    ["quarto vazio", { ...validInput, room: "  " }, "invalid_room"],
    ["quarto com mais de 20 caracteres", { ...validInput, room: "1".repeat(21) }, "room_too_long"],
    ["início vazio", { ...validInput, startsAt: "" }, "invalid_starts_at"],
    ["início sem hora", { ...validInput, startsAt: "2026-09-24" }, "invalid_starts_at"],
    ["dia que não existe", { ...validInput, startsAt: "2026-02-30T10:00" }, "invalid_starts_at"],
    ["hora que não existe", { ...validInput, startsAt: "2026-09-24T24:00" }, "invalid_starts_at"],
    ["duração vazia", { ...validInput, durationMinutes: "" }, "invalid_duration"],
    ["duração não numérica", { ...validInput, durationMinutes: "uma hora" }, "invalid_duration"],
    ["duração fracionada", { ...validInput, durationMinutes: "30.5" }, "invalid_duration"],
    ["duração negativa", { ...validInput, durationMinutes: "-30" }, "invalid_duration"],
    ["duração abaixo de 5 minutos", { ...validInput, durationMinutes: "4" }, "invalid_duration"],
    ["duração acima de 12 horas", { ...validInput, durationMinutes: "721" }, "invalid_duration"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createBooking(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findService).not.toHaveBeenCalled();
    expect(deps.findTherapist).not.toHaveBeenCalled();
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.findTreatmentRoom).not.toHaveBeenCalled();
    expect(deps.findRoomBookings).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna service_not_found sem salvar quando o serviço não é da unidade", async () => {
    const deps = makeDeps({ service: null });

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "service_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna therapist_not_found sem checar conflito nem salvar quando o profissional não pode atender", async () => {
    const deps = makeDeps({ therapist: null });

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_not_found" });
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna therapist_busy sem salvar quando o profissional já tem agendamento no horário", async () => {
    const deps = makeDeps({ busy: true });

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_busy" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna treatment_room_not_found sem checar conflitos nem salvar quando a sala não é da unidade", async () => {
    const deps = makeDeps({ room: null });

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "treatment_room_not_found" });
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.findRoomBookings).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("busca os agendamentos da sala no intervalo do agendamento", async () => {
    const deps = makeDeps();

    await createBooking(validInput, UNIT_ID, deps);

    expect(deps.findRoomBookings).toHaveBeenCalledWith({
      treatmentRoomId: SINGLE_ID,
      startsAt: at("14:30"),
      endsAt: at("15:30"),
    });
  });

  it("retorna therapist_busy antes de olhar a sala", async () => {
    const deps = makeDeps({ busy: true, roomBookings: [{ startsAt: at("14:00"), endsAt: at("15:00") }] });

    const result = await createBooking(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_busy" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  // Sala ocupada: todas as macas já têm atendimento em algum momento do intervalo.
  it.each([
    ["sala single com outro agendamento no mesmo horário", SINGLE, [["14:30", "15:30"]]],
    ["sala single com agendamento começando no meio", SINGLE, [["15:00", "16:00"]]],
    ["sala single com agendamento terminando no meio", SINGLE, [["14:00", "14:45"]]],
    ["sala casal com dois agendamentos simultâneos", COUPLE, [["14:00", "15:00"], ["14:15", "15:30"]]],
    ["sala casal com dois agendamentos que se cruzam por um instante", COUPLE, [["14:00", "14:50"], ["14:45", "16:00"]]],
  ])("retorna room_full sem salvar quando há %s", async (_label, room, times) => {
    const roomBookings = times.map(([start, end]) => ({ startsAt: at(start), endsAt: at(end) }));
    const deps = makeDeps({ room, roomBookings });

    const result = await createBooking({ ...validInput, treatmentRoomId: room.id }, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "room_full" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sala single livre", SINGLE, []],
    ["sala single com agendamentos colados antes e depois", SINGLE, [["13:30", "14:30"], ["15:30", "16:30"]]],
    ["sala casal com um agendamento no mesmo horário", COUPLE, [["14:30", "15:30"]]],
    ["sala casal com dois agendamentos em sequência", COUPLE, [["14:00", "15:00"], ["15:00", "16:00"]]],
  ])("agenda quando há %s", async (_label, room, times) => {
    const roomBookings = times.map(([start, end]) => ({ startsAt: at(start), endsAt: at(end) }));
    const deps = makeDeps({ room, roomBookings });

    const result = await createBooking({ ...validInput, treatmentRoomId: room.id }, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, bookingId: BOOKING_ID });
    expect(deps.insert.mock.calls[0][0].treatmentRoom).toEqual({ roomId: room.id, roomName: room.name });
  });

  it("salva os produtos escolhidos com cópia do nome, sem repetição", async () => {
    const deps = makeDeps();

    await createBooking({ ...validInput, productIds: [TOWEL_ID, OIL_ID, TOWEL_ID] }, UNIT_ID, deps);

    expect(deps.findProducts).toHaveBeenCalledWith([TOWEL_ID, OIL_ID]);
    expect(deps.insert.mock.calls[0][0].products).toEqual([
      { productId: TOWEL_ID, productName: "Toalha" },
      { productId: OIL_ID, productName: "Óleo de amêndoas" },
    ]);
  });

  it.each([
    ["seleção de produtos que não é lista", { ...validInput, productIds: OIL_ID }, "invalid_input"],
    ["mais de 20 produtos", { ...validInput, productIds: Array.from({ length: 21 }, (_, i) => `id-${i}`) }, "too_many_products"],
    ["produto de outra unidade", { ...validInput, productIds: [OTHER_UNIT_PRODUCT_ID] }, "product_not_found"],
  ])("retorna erro sem salvar quando há %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createBooking(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  // Cor do agendamento no calendário: uma da paleta; sem cor, o calendário usa a do profissional.
  it("salva a cor escolhida da paleta, sem espaços nas pontas", async () => {
    const deps = makeDeps();

    const result = await createBooking({ ...validInput, color: " #7c3aed " }, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, bookingId: BOOKING_ID });
    expect(deps.insert.mock.calls[0][0].color).toBe("#7c3aed");
  });

  it.each([undefined, null, "", "  "])("salva sem cor quando a cor não é escolhida (%j)", async (color) => {
    const deps = makeDeps();

    await createBooking({ ...validInput, color }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0].color).toBeNull();
  });

  it.each([
    ["cor fora da paleta", "#123456"],
    ["cor que não é hex", "red"],
    ["cor que não é string", 1],
  ])("retorna invalid_color sem buscar nem salvar quando há %s", async (_label, color) => {
    const deps = makeDeps();

    const result = await createBooking({ ...validInput, color }, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_color" });
    expect(deps.findService).not.toHaveBeenCalled();
    expect(deps.findTherapist).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna unit_not_found sem buscar nem salvar quando não há unitId (%j)",
    async (unitId) => {
      const deps = makeDeps();

      const result = await createBooking(validInput, unitId, deps);

      expect(result).toEqual({ ok: false, error: "unit_not_found" });
      expect(deps.findTherapist).not.toHaveBeenCalled();
      expect(deps.insert).not.toHaveBeenCalled();
    },
  );
});

describe("updateBooking", () => {
  function makeDeps({ found = true, ...options }: Parameters<typeof makeLookups>[0] & { found?: boolean } = {}) {
    // update devolve false quando o agendamento não existe (ou não é da unidade).
    return { ...makeLookups(options), update: vi.fn().mockResolvedValue(found) };
  }

  it("atualiza todos os campos e ignora o próprio agendamento na checagem de conflito", async () => {
    const deps = makeDeps();

    const result = await updateBooking(
      { ...validInput, guestName: "Maria Souza", room: "310", startsAt: "2026-09-24T16:00", durationMinutes: "45" },
      BOOKING_ID,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.hasConflict).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      startsAt: new Date("2026-09-24T19:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:45:00.000Z"),
      excludeId: BOOKING_ID,
    });
    expect(deps.findRoomBookings).toHaveBeenCalledWith({
      treatmentRoomId: SINGLE_ID,
      startsAt: new Date("2026-09-24T19:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:45:00.000Z"),
      excludeId: BOOKING_ID,
    });
    expect(deps.update).toHaveBeenCalledWith(BOOKING_ID, {
      therapistId: ANA_ID,
      therapistName: "Ana",
      guest: { name: "Maria Souza", room: "310" },
      startsAt: new Date("2026-09-24T19:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:45:00.000Z"),
      service: { serviceId: CANDLE_ID, serviceName: "Massagem Candle" },
      treatmentRoom: { roomId: SINGLE_ID, roomName: "Sala Single" },
      products: [],
      color: null,
    });
  });

  it("troca a sala pela escolhida", async () => {
    const deps = makeDeps({ room: COUPLE });

    await updateBooking({ ...validInput, treatmentRoomId: COUPLE_ID }, BOOKING_ID, deps);

    expect(deps.update.mock.calls[0][1].treatmentRoom).toEqual({ roomId: COUPLE_ID, roomName: "Sala Casal" });
  });

  // Enviar a lista vazia apaga os produtos salvos.
  it("troca os produtos pelos escolhidos", async () => {
    const deps = makeDeps();

    await updateBooking({ ...validInput, productIds: [OIL_ID] }, BOOKING_ID, deps);

    expect(deps.update.mock.calls[0][1].products).toEqual([{ productId: OIL_ID, productName: "Óleo de amêndoas" }]);
  });

  it("troca a cor pela escolhida", async () => {
    const deps = makeDeps();

    await updateBooking({ ...validInput, color: "#db2777" }, BOOKING_ID, deps);

    expect(deps.update.mock.calls[0][1].color).toBe("#db2777");
  });

  // Voltar para "automática" apaga a cor salva.
  it("apaga a cor quando nenhuma é escolhida", async () => {
    const deps = makeDeps();

    await updateBooking({ ...validInput, color: "" }, BOOKING_ID, deps);

    expect(deps.update.mock.calls[0][1].color).toBeNull();
  });

  it("retorna invalid_color sem salvar quando a cor não é da paleta", async () => {
    const deps = makeDeps();

    const result = await updateBooking({ ...validInput, color: "#123456" }, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_color" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna product_not_found sem salvar quando algum produto não é da unidade", async () => {
    const deps = makeDeps();

    const result = await updateBooking({ ...validInput, productIds: [OTHER_UNIT_PRODUCT_ID] }, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["profissional não escolhido", { ...validInput, therapistId: "" }, "invalid_therapist"],
    ["serviço não escolhido", { ...validInput, serviceId: "" }, "invalid_service"],
    ["sala não escolhida", { ...validInput, treatmentRoomId: "" }, "invalid_treatment_room"],
    ["nome do hóspede vazio", { ...validInput, guestName: "   " }, "invalid_guest_name"],
    ["dia que não existe", { ...validInput, startsAt: "2026-02-30T10:00" }, "invalid_starts_at"],
    ["duração acima de 12 horas", { ...validInput, durationMinutes: "721" }, "invalid_duration"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateBooking(input, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findTherapist).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["service_not_found", { service: null }],
    ["therapist_not_found", { therapist: null }],
    ["therapist_busy", { busy: true }],
    ["treatment_room_not_found", { room: null }],
    ["room_full", { roomBookings: [{ startsAt: at("14:00"), endsAt: at("15:00") }] }],
  ] as const)("retorna %s sem salvar", async (error, options) => {
    const deps = makeDeps(options);

    const result = await updateBooking(validInput, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna booking_not_found sem buscar nem salvar quando não há bookingId (%j)",
    async (bookingId) => {
      const deps = makeDeps();

      const result = await updateBooking(validInput, bookingId, deps);

      expect(result).toEqual({ ok: false, error: "booking_not_found" });
      expect(deps.findTherapist).not.toHaveBeenCalled();
      expect(deps.update).not.toHaveBeenCalled();
    },
  );

  it("retorna booking_not_found quando o agendamento não existe (ou não é da unidade)", async () => {
    const result = await updateBooking(validInput, BOOKING_ID, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
  });
});

// Arrastar ou redimensionar no calendário: só início e fim mudam.
describe("rescheduleBooking", () => {
  const validTimes = { startsAt: "2026-09-24T15:00", endsAt: "2026-09-24T16:30" };

  type FoundBooking = { therapistId: string; treatmentRoom: { roomId: string; beds: number } | null };

  function makeDeps({
    booking = { therapistId: ANA_ID, treatmentRoom: { roomId: SINGLE_ID, beds: 1 } } as FoundBooking | null,
    busy = false,
    roomBookings = [] as RoomBooking[],
    found = true,
  } = {}) {
    return {
      // Devolve o profissional e a sala do agendamento, ou null se não existe (ou não é do workspace).
      // treatmentRoom null: a sala foi removida da unidade.
      findBooking: vi.fn().mockResolvedValue(booking),
      hasConflict: vi.fn().mockResolvedValue(busy),
      findRoomBookings: vi.fn().mockResolvedValue(roomBookings),
      update: vi.fn().mockResolvedValue(found),
    };
  }

  it("atualiza início e fim convertidos para UTC, checando conflito do profissional do agendamento", async () => {
    const deps = makeDeps();

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(deps.hasConflict).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      startsAt: new Date("2026-09-24T18:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:30:00.000Z"),
      excludeId: BOOKING_ID,
    });
    expect(deps.findRoomBookings).toHaveBeenCalledWith({
      treatmentRoomId: SINGLE_ID,
      startsAt: new Date("2026-09-24T18:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:30:00.000Z"),
      excludeId: BOOKING_ID,
    });
    expect(deps.update).toHaveBeenCalledWith(BOOKING_ID, {
      startsAt: new Date("2026-09-24T18:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:30:00.000Z"),
    });
  });

  it("aceita terminar no dia seguinte", async () => {
    const deps = makeDeps();

    const result = await rescheduleBooking({ startsAt: "2026-09-24T23:30", endsAt: "2026-09-25T00:30" }, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["fim ausente", { startsAt: validTimes.startsAt }, "invalid_input"],
    ["início inválido", { ...validTimes, startsAt: "2026-02-30T10:00" }, "invalid_starts_at"],
    ["fim inválido", { ...validTimes, endsAt: "amanhã" }, "invalid_duration"],
    ["fim igual ao início", { ...validTimes, endsAt: validTimes.startsAt }, "invalid_duration"],
    ["fim antes do início", { ...validTimes, endsAt: "2026-09-24T14:00" }, "invalid_duration"],
    ["menos de 5 minutos", { ...validTimes, endsAt: "2026-09-24T15:04" }, "invalid_duration"],
    ["mais de 12 horas", { ...validTimes, endsAt: "2026-09-25T03:01" }, "invalid_duration"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await rescheduleBooking(input, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findBooking).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna booking_not_found sem buscar nem salvar quando não há bookingId (%j)",
    async (bookingId) => {
      const deps = makeDeps();

      const result = await rescheduleBooking(validTimes, bookingId, deps);

      expect(result).toEqual({ ok: false, error: "booking_not_found" });
      expect(deps.findBooking).not.toHaveBeenCalled();
      expect(deps.update).not.toHaveBeenCalled();
    },
  );

  it("retorna booking_not_found sem checar conflito quando o agendamento não é encontrado", async () => {
    const deps = makeDeps({ booking: null });

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
    expect(deps.hasConflict).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna therapist_busy sem salvar quando o novo horário conflita", async () => {
    const deps = makeDeps({ busy: true });

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_busy" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna room_full sem salvar quando a sala está ocupada no novo horário", async () => {
    const deps = makeDeps({ roomBookings: [{ startsAt: at("16:00"), endsAt: at("17:00") }] });

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "room_full" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("move para o horário em que a sala casal ainda tem maca livre", async () => {
    const deps = makeDeps({
      booking: { therapistId: ANA_ID, treatmentRoom: { roomId: COUPLE_ID, beds: 2 } },
      roomBookings: [{ startsAt: at("15:00"), endsAt: at("16:30") }],
    });

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: true });
  });

  it("retorna treatment_room_not_found sem salvar quando a sala do agendamento foi removida", async () => {
    const deps = makeDeps({ booking: { therapistId: ANA_ID, treatmentRoom: null } });

    const result = await rescheduleBooking(validTimes, BOOKING_ID, deps);

    expect(result).toEqual({ ok: false, error: "treatment_room_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna booking_not_found quando o agendamento some antes de salvar", async () => {
    const result = await rescheduleBooking(validTimes, BOOKING_ID, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
  });
});

describe("deleteBooking", () => {
  it("exclui o agendamento pelo id", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteBooking(BOOKING_ID, remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(BOOKING_ID);
  });

  it.each([undefined, null, ""])(
    "retorna booking_not_found sem excluir quando não há bookingId (%j)",
    async (bookingId) => {
      const remove = vi.fn().mockResolvedValue(true);

      const result = await deleteBooking(bookingId, remove);

      expect(result).toEqual({ ok: false, error: "booking_not_found" });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("retorna booking_not_found quando o agendamento não existe (ou não é do workspace)", async () => {
    const result = await deleteBooking(BOOKING_ID, vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "booking_not_found" });
  });
});
