import { describe, it, expect, vi } from "vitest";
import { createAppointment, deleteAppointment, updateAppointment } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const APPOINTMENT_ID = "64b7f0c2a1b2c3d4e5f60740";
const CANDLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const RELAX_ID = "64b7f0c2a1b2c3d4e5f60732";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const BIA_ID = "64b7f0c2a1b2c3d4e5f60752";

const HYDRO_ID = "64b7f0c2a1b2c3d4e5f60733";

// A hidromassagem não tem profissional (e, portanto, não gera comissão).
const SERVICES = [
  { id: CANDLE_ID, name: "Massagem Candle", priceCents: 35000, durationMinutes: 60, requiresTherapist: true },
  { id: RELAX_ID, name: "Massagem Relaxante", priceCents: 28000, durationMinutes: 50, requiresTherapist: true },
  { id: HYDRO_ID, name: "Hidromassagem", priceCents: 15000, durationMinutes: 30, requiresTherapist: false },
];
const THERAPISTS = [
  { id: ANA_ID, name: "Ana" },
  { id: BIA_ID, name: "Bia" },
];
const OIL_ID = "64b7f0c2a1b2c3d4e5f60761";
const TOWEL_ID = "64b7f0c2a1b2c3d4e5f60762";
const OTHER_UNIT_PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60769";
const PRODUCTS = [
  { id: OIL_ID, name: "Óleo de amêndoas" },
  { id: TOWEL_ID, name: "Toalha" },
];

// Como chega do FormData: datetime-local (horário de Brasília) e os pares
// serviço/profissional via getAll, na mesma ordem.
const validInput = {
  guestName: "João Silva",
  room: "204",
  performedAt: "2026-09-24T14:30",
  serviceIds: [CANDLE_ID],
  therapistIds: [ANA_ID],
};

function makeDeps({ services = SERVICES, therapists = THERAPISTS } = {}) {
  return {
    // Devolvem só os que existem (serviços da unidade; profissionais do workspace).
    findServices: vi.fn(async (ids: string[]) => services.filter((s) => ids.includes(s.id))),
    findTherapists: vi.fn(async (ids: string[]) => therapists.filter((t) => ids.includes(t.id))),
    // Devolve só os produtos que existem na unidade.
    findProducts: vi.fn(async (ids: string[]) => PRODUCTS.filter((p) => ids.includes(p.id))),
    insert: vi.fn().mockResolvedValue({ id: APPOINTMENT_ID }),
  };
}

describe("createAppointment", () => {
  it("cria o atendimento copiando nome, valor e duração do serviço e o nome do profissional", async () => {
    const deps = makeDeps();

    const result = await createAppointment(validInput, UNIT_ID, deps);

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
          durationMinutes: 60,
          therapistId: ANA_ID,
          therapistName: "Ana",
        },
      ],
      products: [],
    });
  });

  it("aceita vários serviços, mantendo a ordem e o par serviço/profissional", async () => {
    const deps = makeDeps();

    await createAppointment(
      { ...validInput, serviceIds: [RELAX_ID, CANDLE_ID], therapistIds: [BIA_ID, ANA_ID] },
      UNIT_ID,
      deps,
    );

    expect(deps.insert.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ serviceId: RELAX_ID, priceCents: 28000, therapistId: BIA_ID, therapistName: "Bia" }),
      expect.objectContaining({ serviceId: CANDLE_ID, priceCents: 35000, therapistId: ANA_ID, therapistName: "Ana" }),
    ]);
  });

  it("aceita o mesmo serviço e o mesmo profissional repetidos, buscando cada id uma vez só", async () => {
    const deps = makeDeps();

    await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, CANDLE_ID], therapistIds: [ANA_ID, ANA_ID] },
      UNIT_ID,
      deps,
    );

    expect(deps.findServices).toHaveBeenCalledWith([CANDLE_ID]);
    expect(deps.findTherapists).toHaveBeenCalledWith([ANA_ID]);
    expect(deps.insert.mock.calls[0][0].items).toHaveLength(2);
  });

  it("remove espaços das pontas do nome do hóspede, do quarto e dos ids", async () => {
    const deps = makeDeps();

    await createAppointment(
      {
        ...validInput,
        guestName: "  João Silva  ",
        room: " 204 ",
        performedAt: " 2026-09-24T14:30 ",
        serviceIds: [` ${CANDLE_ID} `],
        therapistIds: [` ${ANA_ID} `],
      },
      UNIT_ID,
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performedAt: new Date("2026-09-24T17:30:00.000Z"),
        guest: { name: "João Silva", room: "204" },
        items: [expect.objectContaining({ serviceId: CANDLE_ID, therapistId: ANA_ID })],
      }),
    );
  });

  it("converte a data/hora de Brasília para UTC mesmo quando vira o dia", async () => {
    const deps = makeDeps();

    await createAppointment({ ...validInput, performedAt: "2026-12-31T22:15" }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0].performedAt).toEqual(new Date("2027-01-01T01:15:00.000Z"));
  });

  // A duração de cada serviço chega numa terceira lista paralela; vazia, vale a do cadastro.
  it("usa a duração informada em cada serviço e a do cadastro quando ela vem vazia", async () => {
    const deps = makeDeps();

    await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, RELAX_ID], therapistIds: [ANA_ID, BIA_ID], durations: [" 90 ", ""] },
      UNIT_ID,
      deps,
    );

    expect(deps.insert.mock.calls[0][0].items.map((item: { durationMinutes: number }) => item.durationMinutes)).toEqual(
      [90, 50],
    );
  });

  it("aceita duração de 5 minutos e de 12 horas (limites)", async () => {
    const deps = makeDeps();

    const result = await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, CANDLE_ID], therapistIds: [ANA_ID, ANA_ID], durations: ["5", "720"] },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.insert.mock.calls[0][0].items.map((item: { durationMinutes: number }) => item.durationMinutes)).toEqual(
      [5, 720],
    );
  });

  it.each([
    ["durations não é lista", { ...validInput, durations: "60" }, "invalid_input"],
    ["item de durations não é string", { ...validInput, durations: [60] }, "invalid_input"],
    ["durations com tamanho diferente dos serviços", { ...validInput, durations: ["60", "30"] }, "invalid_item"],
    ["duração menor que 5 minutos", { ...validInput, durations: ["4"] }, "invalid_duration"],
    ["duração zero", { ...validInput, durations: ["0"] }, "invalid_duration"],
    ["duração maior que 12 horas", { ...validInput, durations: ["721"] }, "invalid_duration"],
    ["duração não numérica", { ...validInput, durations: ["uma hora"] }, "invalid_duration"],
    ["duração fracionada", { ...validInput, durations: ["1.5"] }, "invalid_duration"],
    ["duração negativa", { ...validInput, durations: ["-30"] }, "invalid_duration"],
  ])("retorna erro de duração sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createAppointment(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findServices).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("aceita nome do hóspede com 80 caracteres, quarto com 20 e 20 serviços (limites)", async () => {
    const result = await createAppointment(
      {
        ...validInput,
        guestName: "a".repeat(80),
        room: "1".repeat(20),
        serviceIds: Array(20).fill(CANDLE_ID),
        therapistIds: Array(20).fill(ANA_ID),
      },
      UNIT_ID,
      makeDeps(),
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome do hóspede não é string", { ...validInput, guestName: 1 }, "invalid_input"],
    ["quarto ausente (null do FormData)", { ...validInput, room: null }, "invalid_input"],
    ["data/hora ausente", { ...validInput, performedAt: null }, "invalid_input"],
    ["serviceIds não é lista", { ...validInput, serviceIds: CANDLE_ID }, "invalid_input"],
    ["therapistIds ausente", { ...validInput, therapistIds: undefined }, "invalid_input"],
    ["item da lista não é string", { ...validInput, serviceIds: [123] }, "invalid_input"],
    ["nome do hóspede vazio", { ...validInput, guestName: "   " }, "invalid_guest_name"],
    ["nome do hóspede com mais de 80 caracteres", { ...validInput, guestName: "a".repeat(81) }, "guest_name_too_long"],
    ["quarto vazio", { ...validInput, room: "  " }, "invalid_room"],
    ["quarto com mais de 20 caracteres", { ...validInput, room: "1".repeat(21) }, "room_too_long"],
    ["data/hora vazia", { ...validInput, performedAt: "" }, "invalid_performed_at"],
    ["data sem hora", { ...validInput, performedAt: "2026-09-24" }, "invalid_performed_at"],
    ["data/hora não é data", { ...validInput, performedAt: "ontem" }, "invalid_performed_at"],
    ["dia que não existe", { ...validInput, performedAt: "2026-02-30T10:00" }, "invalid_performed_at"],
    ["hora que não existe", { ...validInput, performedAt: "2026-09-24T25:00" }, "invalid_performed_at"],
    ["nenhum serviço", { ...validInput, serviceIds: [], therapistIds: [] }, "no_items"],
    [
      "mais de 20 serviços",
      { ...validInput, serviceIds: Array(21).fill(CANDLE_ID), therapistIds: Array(21).fill(ANA_ID) },
      "too_many_items",
    ],
    ["serviço sem profissional (listas de tamanhos diferentes)", { ...validInput, therapistIds: [] }, "invalid_item"],
    ["serviço não escolhido", { ...validInput, serviceIds: [""] }, "invalid_item"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createAppointment(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findServices).not.toHaveBeenCalled();
    expect(deps.findTherapists).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna service_not_found sem salvar quando algum serviço não é da unidade", async () => {
    const deps = makeDeps({ services: [SERVICES[0]] });

    const result = await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, RELAX_ID], therapistIds: [ANA_ID, ANA_ID] },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "service_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna therapist_not_found sem salvar quando algum profissional não é do workspace", async () => {
    const deps = makeDeps({ therapists: [THERAPISTS[0]] });

    const result = await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, CANDLE_ID], therapistIds: [ANA_ID, BIA_ID] },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "therapist_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("salva os produtos escolhidos com cópia do nome, sem repetição", async () => {
    const deps = makeDeps();

    await createAppointment({ ...validInput, productIds: [TOWEL_ID, OIL_ID, TOWEL_ID] }, UNIT_ID, deps);

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

    const result = await createAppointment(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna unit_not_found sem buscar nem salvar quando não há unitId (%j)",
    async (unitId) => {
      const deps = makeDeps();

      const result = await createAppointment(validInput, unitId, deps);

      expect(result).toEqual({ ok: false, error: "unit_not_found" });
      expect(deps.findServices).not.toHaveBeenCalled();
      expect(deps.insert).not.toHaveBeenCalled();
    },
  );
});

describe("updateAppointment", () => {
  function makeUpdateDeps({ found = true, services = SERVICES, therapists = THERAPISTS } = {}) {
    return {
      findServices: vi.fn(async (ids: string[]) => services.filter((s) => ids.includes(s.id))),
      findTherapists: vi.fn(async (ids: string[]) => therapists.filter((t) => ids.includes(t.id))),
      findProducts: vi.fn(async (ids: string[]) => PRODUCTS.filter((p) => ids.includes(p.id))),
      // Devolve false quando o atendimento não existe (ou não é da unidade).
      update: vi.fn().mockResolvedValue(found),
    };
  }

  it("atualiza hóspede, data/hora e serviços, copiando de novo os dados atuais do serviço e do profissional", async () => {
    const deps = makeUpdateDeps();

    const result = await updateAppointment(
      {
        guestName: "  Maria Souza  ",
        room: " 310 ",
        performedAt: "2026-09-24T16:00",
        serviceIds: [RELAX_ID, CANDLE_ID],
        therapistIds: [BIA_ID, ANA_ID],
      },
      APPOINTMENT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, {
      performedAt: new Date("2026-09-24T19:00:00.000Z"),
      guest: { name: "Maria Souza", room: "310" },
      items: [
        {
          serviceId: RELAX_ID,
          serviceName: "Massagem Relaxante",
          priceCents: 28000,
          durationMinutes: 50,
          therapistId: BIA_ID,
          therapistName: "Bia",
        },
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
  });

  // Ao editar, o formulário reenvia a duração salva, que não volta para a do cadastro.
  it("mantém a duração informada ao editar", async () => {
    const deps = makeUpdateDeps();

    await updateAppointment({ ...validInput, durations: ["75"] }, APPOINTMENT_ID, deps);

    expect(deps.update.mock.calls[0][1].items[0].durationMinutes).toBe(75);
  });

  // Enviar a lista vazia apaga os produtos salvos.
  it("troca os produtos pelos escolhidos", async () => {
    const deps = makeUpdateDeps();

    await updateAppointment({ ...validInput, productIds: [OIL_ID] }, APPOINTMENT_ID, deps);

    expect(deps.update.mock.calls[0][1].products).toEqual([{ productId: OIL_ID, productName: "Óleo de amêndoas" }]);
  });

  it("retorna product_not_found sem salvar quando algum produto não é da unidade", async () => {
    const deps = makeUpdateDeps();

    const result = await updateAppointment(
      { ...validInput, productIds: [OTHER_UNIT_PRODUCT_ID] },
      APPOINTMENT_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome do hóspede vazio", { ...validInput, guestName: "   " }, "invalid_guest_name"],
    ["quarto com mais de 20 caracteres", { ...validInput, room: "1".repeat(21) }, "room_too_long"],
    ["dia que não existe", { ...validInput, performedAt: "2026-02-30T10:00" }, "invalid_performed_at"],
    ["nenhum serviço", { ...validInput, serviceIds: [], therapistIds: [] }, "no_items"],
    ["serviço sem profissional", { ...validInput, therapistIds: [] }, "invalid_item"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, input, error) => {
    const deps = makeUpdateDeps();

    const result = await updateAppointment(input, APPOINTMENT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findServices).not.toHaveBeenCalled();
    expect(deps.findTherapists).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna service_not_found sem salvar quando algum serviço não é da unidade", async () => {
    const deps = makeUpdateDeps({ services: [] });

    const result = await updateAppointment(validInput, APPOINTMENT_ID, deps);

    expect(result).toEqual({ ok: false, error: "service_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna therapist_not_found sem salvar quando algum profissional não pode atender", async () => {
    const deps = makeUpdateDeps({ therapists: [] });

    const result = await updateAppointment(validInput, APPOINTMENT_ID, deps);

    expect(result).toEqual({ ok: false, error: "therapist_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna appointment_not_found sem buscar nem salvar quando não há appointmentId (%j)",
    async (appointmentId) => {
      const deps = makeUpdateDeps();

      const result = await updateAppointment(validInput, appointmentId, deps);

      expect(result).toEqual({ ok: false, error: "appointment_not_found" });
      expect(deps.findServices).not.toHaveBeenCalled();
      expect(deps.update).not.toHaveBeenCalled();
    },
  );

  it("retorna appointment_not_found quando o atendimento não existe (ou não é da unidade)", async () => {
    const result = await updateAppointment(validInput, APPOINTMENT_ID, makeUpdateDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "appointment_not_found" });
  });
});

describe("deleteAppointment", () => {
  it("exclui o atendimento pelo id", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteAppointment(APPOINTMENT_ID, remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(APPOINTMENT_ID);
  });

  it.each([undefined, null, ""])(
    "retorna appointment_not_found sem excluir quando não há appointmentId (%j)",
    async (appointmentId) => {
      const remove = vi.fn().mockResolvedValue(true);

      const result = await deleteAppointment(appointmentId, remove);

      expect(result).toEqual({ ok: false, error: "appointment_not_found" });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("retorna appointment_not_found quando o atendimento não existe (ou não é da unidade)", async () => {
    const result = await deleteAppointment(APPOINTMENT_ID, vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "appointment_not_found" });
  });
});

// Desconto no total do atendimento, em % ou R$, rateado entre os serviços proporcionalmente ao
// valor: priceCents de cada item passa a ser o valor cobrado, então fluxo de caixa, comissão e
// repasse já saem sobre o valor com desconto.
describe("desconto no atendimento", () => {
  // Candle (R$ 350) + Relaxante (R$ 280) = R$ 630.
  const twoServices = { ...validInput, serviceIds: [CANDLE_ID, RELAX_ID], therapistIds: [ANA_ID, BIA_ID] };

  function insertedPrices(deps: ReturnType<typeof makeDeps>) {
    return deps.insert.mock.calls[0][0].items.map((item: { priceCents: number }) => item.priceCents);
  }

  it("sem tipo de desconto, não aplica desconto e ignora o motivo", async () => {
    const deps = makeDeps();

    await createAppointment({ ...twoServices, discountType: "", discountValue: "", discountReason: "x" }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0].discount).toBeUndefined();
    expect(insertedPrices(deps)).toEqual([35000, 28000]);
  });

  it("aplica desconto percentual rateado entre os serviços e guarda o motivo", async () => {
    const deps = makeDeps();

    const result = await createAppointment(
      { ...twoServices, discountType: "percent", discountValue: " 10 ", discountReason: "  Cliente fiel  " },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.insert.mock.calls[0][0].discount).toEqual({
      type: "percent",
      percent: 10,
      cents: 6300,
      reason: "Cliente fiel",
    });
    expect(insertedPrices(deps)).toEqual([31500, 25200]);
  });

  it("arredonda o desconto percentual para o centavo mais próximo e aceita até 2 casas", async () => {
    const deps = makeDeps();

    // 33,33% de R$ 350,00 = R$ 116,655 -> R$ 116,66.
    await createAppointment({ ...validInput, discountType: "percent", discountValue: "33.33" }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0].discount).toEqual({ type: "percent", percent: 33.33, cents: 11666, reason: "" });
    expect(insertedPrices(deps)).toEqual([23334]);
  });

  it("aplica desconto em valor, distribuindo os centavos que sobram pelo maior resto", async () => {
    const deps = makeDeps();

    // R$ 100 sobre R$ 630: 5555,55 e 4444,44 -> o centavo que sobra vai para o primeiro.
    await createAppointment({ ...twoServices, discountType: "amount", discountValue: "100" }, UNIT_ID, deps);

    expect(deps.insert.mock.calls[0][0].discount).toEqual({ type: "amount", cents: 10000, reason: "" });
    expect(insertedPrices(deps)).toEqual([35000 - 5556, 28000 - 4444]);
  });

  it("aceita desconto de 100% e desconto em valor igual ao total (cortesia)", async () => {
    const percentDeps = makeDeps();
    const amountDeps = makeDeps();

    await createAppointment({ ...twoServices, discountType: "percent", discountValue: "100" }, UNIT_ID, percentDeps);
    await createAppointment({ ...twoServices, discountType: "amount", discountValue: "630.00" }, UNIT_ID, amountDeps);

    expect(insertedPrices(percentDeps)).toEqual([0, 0]);
    expect(insertedPrices(amountDeps)).toEqual([0, 0]);
  });

  it("aceita motivo com 120 caracteres (limite)", async () => {
    const result = await createAppointment(
      { ...validInput, discountType: "amount", discountValue: "10", discountReason: "a".repeat(120) },
      UNIT_ID,
      makeDeps(),
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
  });

  it.each([
    ["discountType não é string", { discountType: 1, discountValue: "10" }, "invalid_input"],
    ["discountValue não é string", { discountType: "percent", discountValue: 10 }, "invalid_input"],
    ["discountReason não é string", { discountType: "percent", discountValue: "10", discountReason: 1 }, "invalid_input"],
    ["tipo desconhecido", { discountType: "brinde", discountValue: "10" }, "invalid_discount"],
    ["valor vazio", { discountType: "percent", discountValue: " " }, "invalid_discount"],
    ["percentual zero", { discountType: "percent", discountValue: "0" }, "invalid_discount"],
    ["percentual acima de 100", { discountType: "percent", discountValue: "100.01" }, "invalid_discount"],
    ["percentual com 3 casas", { discountType: "percent", discountValue: "10.555" }, "invalid_discount"],
    ["percentual negativo", { discountType: "percent", discountValue: "-10" }, "invalid_discount"],
    ["valor zero", { discountType: "amount", discountValue: "0" }, "invalid_discount"],
    ["valor não numérico", { discountType: "amount", discountValue: "dez" }, "invalid_discount"],
    ["motivo com mais de 120 caracteres", { discountType: "amount", discountValue: "10", discountReason: "a".repeat(121) }, "discount_reason_too_long"],
  ])("retorna erro sem buscar nem salvar quando %s", async (_label, discount, error) => {
    const deps = makeDeps();

    const result = await createAppointment({ ...validInput, ...discount }, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findServices).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna discount_exceeds_total sem salvar quando o valor passa do total dos serviços", async () => {
    const deps = makeDeps();

    const result = await createAppointment(
      { ...twoServices, discountType: "amount", discountValue: "630.01" },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "discount_exceeds_total" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recalcula o desconto sobre os valores atuais dos serviços ao editar", async () => {
    const update = vi.fn().mockResolvedValue(true);
    const { insert: _insert, ...lookups } = makeDeps();

    const result = await updateAppointment(
      { ...twoServices, discountType: "percent", discountValue: "50", discountReason: "Cortesia parcial" },
      APPOINTMENT_ID,
      { ...lookups, update },
    );

    expect(result).toEqual({ ok: true });
    const fields = update.mock.calls[0][1];
    expect(fields.discount).toEqual({ type: "percent", percent: 50, cents: 31500, reason: "Cortesia parcial" });
    expect(fields.items.map((item: { priceCents: number }) => item.priceCents)).toEqual([17500, 14000]);
  });
});

// O profissional de cada item só é obrigatório quando o serviço exige.
describe("atendimento com serviço sem profissional", () => {
  function makeUpdateDeps() {
    return { ...makeDeps(), update: vi.fn().mockResolvedValue(true) };
  }

  it("registra o item sem profissional e não busca profissionais quando nenhum item precisa", async () => {
    const deps = makeDeps();

    const result = await createAppointment(
      { ...validInput, serviceIds: [HYDRO_ID], therapistIds: [""] },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.insert.mock.calls[0][0].items).toEqual([
      {
        serviceId: HYDRO_ID,
        serviceName: "Hidromassagem",
        priceCents: 15000,
        durationMinutes: 30,
        therapistId: null,
        therapistName: null,
      },
    ]);
    expect(deps.findTherapists).not.toHaveBeenCalled();
  });

  it("mistura itens com e sem profissional, buscando só os profissionais necessários", async () => {
    const deps = makeDeps();

    await createAppointment(
      { ...validInput, serviceIds: [CANDLE_ID, HYDRO_ID], therapistIds: [ANA_ID, ""] },
      UNIT_ID,
      deps,
    );

    expect(deps.findTherapists).toHaveBeenCalledWith([ANA_ID]);
    expect(deps.insert.mock.calls[0][0].items.map((item: { therapistId: string | null; therapistName: string | null }) => [item.therapistId, item.therapistName])).toEqual([
      [ANA_ID, "Ana"],
      [null, null],
    ]);
  });

  it("descarta o profissional informado num serviço que não usa profissional", async () => {
    const deps = makeDeps();

    await createAppointment(
      { ...validInput, serviceIds: [HYDRO_ID], therapistIds: [BIA_ID] },
      UNIT_ID,
      deps,
    );

    expect(deps.findTherapists).not.toHaveBeenCalled();
    expect(deps.insert.mock.calls[0][0].items[0]).toEqual(expect.objectContaining({ therapistId: null, therapistName: null }));
  });

  it("ao editar, aceita o serviço sem profissional", async () => {
    const deps = makeUpdateDeps();

    const result = await updateAppointment(
      { ...validInput, serviceIds: [HYDRO_ID], therapistIds: [""] },
      APPOINTMENT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update.mock.calls[0][1].items[0]).toEqual(expect.objectContaining({ therapistId: null, therapistName: null }));
  });

  it.each(["", "  "])(
    "retorna invalid_item sem buscar profissionais nem salvar quando o serviço exige profissional e ele não vem (%j)",
    async (therapistId) => {
      const deps = makeDeps();
      const updateDeps = makeUpdateDeps();

      const created = await createAppointment(
        { ...validInput, serviceIds: [HYDRO_ID, CANDLE_ID], therapistIds: ["", therapistId] },
        UNIT_ID,
        deps,
      );
      const updated = await updateAppointment({ ...validInput, therapistIds: [therapistId] }, APPOINTMENT_ID, updateDeps);

      expect(created).toEqual({ ok: false, error: "invalid_item" });
      expect(updated).toEqual({ ok: false, error: "invalid_item" });
      expect(deps.findTherapists).not.toHaveBeenCalled();
      expect(deps.insert).not.toHaveBeenCalled();
      expect(updateDeps.update).not.toHaveBeenCalled();
    },
  );
});
