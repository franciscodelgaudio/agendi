import { describe, it, expect } from "vitest";
import {
  AGENIA_ACTION_NAMES,
  AGENIA_ACTIONS,
  actionFormEntries,
  isAgeniaAction,
  mergePatch,
  parseAgeniaAction,
} from "@/lib/agenia-actions";

const UNIT = "64b7f0c2a1b2c3d4e5f60719";
const ID_A = "64b7f0c2a1b2c3d4e5f6071a";
const ID_B = "64b7f0c2a1b2c3d4e5f6071b";

// Entradas do FormData agrupadas por chave: a ordem entre chaves diferentes não importa.
function grouped(entries: [string, string][]) {
  const map: Record<string, string[]> = {};
  for (const [key, value] of entries) (map[key] ??= []).push(value);
  return map;
}

function parsed(name: string, input: unknown) {
  const result = parseAgeniaAction(name, input);
  if (!result.ok) throw new Error(`esperava entrada válida: ${result.error}`);
  return result.input;
}

describe("catálogo", () => {
  it("toda ação tem rótulo e descrição em português", () => {
    for (const name of AGENIA_ACTION_NAMES) {
      expect(AGENIA_ACTIONS[name].label.length).toBeGreaterThan(0);
      expect(AGENIA_ACTIONS[name].description.length).toBeGreaterThan(0);
    }
  });

  it("cobre as áreas do sistema", () => {
    expect(AGENIA_ACTION_NAMES).toEqual(
      expect.arrayContaining([
        "createService",
        "updateService",
        "deleteService",
        "createProduct",
        "updateProduct",
        "deleteProduct",
        "createBooking",
        "rescheduleBooking",
        "deleteBooking",
        "createAppointment",
        "deleteAppointment",
        "createExpense",
        "setExpensePaid",
        "deleteExpense",
        "inviteMember",
        "updateMember",
        "removeMember",
        "setUraActive",
        "deleteUra",
        "sendReply",
        "takeConversation",
        "closeConversation",
        "stopConversationUra",
        "createTicket",
      ]),
    );
  });

  it("isAgeniaAction reconhece só as ações do catálogo", () => {
    expect(isAgeniaAction("createService")).toBe(true);
    expect(isAgeniaAction("listServices")).toBe(false);
    expect(isAgeniaAction("toString")).toBe(false);
  });
});

describe("parseAgeniaAction", () => {
  it("recusa ação desconhecida", () => {
    expect(parseAgeniaAction("dropDatabase", {})).toEqual({ ok: false, error: "unknown_action" });
  });

  it("aceita entrada válida e descarta campos que a ação não conhece", () => {
    const result = parseAgeniaAction("createService", {
      unitId: UNIT,
      name: "Massagem relaxante",
      price: 150.5,
      durationMinutes: 60,
      summary: "Criar o serviço",
      hack: true,
    });
    expect(result).toEqual({
      ok: true,
      name: "createService",
      input: { unitId: UNIT, name: "Massagem relaxante", price: 150.5, durationMinutes: 60, productIds: [], summary: "Criar o serviço" },
    });
  });

  it("exige o resumo que aparece no card de autorização", () => {
    expect(parseAgeniaAction("deleteService", { unitId: UNIT, serviceId: ID_A })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("recusa ids que não são ObjectId", () => {
    expect(parseAgeniaAction("deleteService", { unitId: "unidade-1", serviceId: ID_A, summary: "x" }).ok).toBe(false);
  });

  it("recusa valores e durações fora do formato", () => {
    const base = { unitId: UNIT, name: "Massagem", durationMinutes: 60, summary: "x" };
    expect(parseAgeniaAction("createService", { ...base, price: -1 }).ok).toBe(false);
    expect(parseAgeniaAction("createService", { ...base, price: 10.555 }).ok).toBe(false);
    expect(parseAgeniaAction("createService", { ...base, price: 10, durationMinutes: 12.5 }).ok).toBe(false);
  });

  it("exige data e hora no formato AAAA-MM-DDTHH:mm", () => {
    const booking = {
      unitId: UNIT,
      therapistId: ID_A,
      serviceId: ID_B,
      treatmentRoomId: ID_A,
      guestName: "Ana",
      room: "101",
      durationMinutes: 60,
      summary: "x",
    };
    expect(parseAgeniaAction("createBooking", { ...booking, startsAt: "2026-09-30T14:00" }).ok).toBe(true);
    expect(parseAgeniaAction("createBooking", { ...booking, startsAt: "30/09/2026 14:00" }).ok).toBe(false);
    expect(parseAgeniaAction("createBooking", { ...booking, startsAt: "2026-09-30T14:00:00Z" }).ok).toBe(false);
  });

  it("exige dia no formato AAAA-MM-DD nas despesas", () => {
    const expense = { unitId: UNIT, groupId: ID_A, description: "Toalhas", amount: 80, paid: false, summary: "x" };
    expect(parseAgeniaAction("createExpense", { ...expense, date: "2026-09-20" }).ok).toBe(true);
    expect(parseAgeniaAction("createExpense", { ...expense, date: "20/09/2026" }).ok).toBe(false);
  });

  it("só aceita funções de membro existentes", () => {
    expect(parseAgeniaAction("inviteMember", { email: "a@b.com", role: "receptionist", summary: "x" }).ok).toBe(true);
    expect(parseAgeniaAction("inviteMember", { email: "a@b.com", role: "owner", summary: "x" }).ok).toBe(false);
    expect(parseAgeniaAction("inviteMember", { email: "não é email", role: "admin", summary: "x" }).ok).toBe(false);
  });

  it("nas edições, os campos a mudar são opcionais", () => {
    expect(parseAgeniaAction("updateService", { unitId: UNIT, serviceId: ID_A, price: 200, summary: "x" }).ok).toBe(true);
  });
});

describe("actionFormEntries", () => {
  it("serviço: valor com duas casas e um productId por produto", () => {
    const input = parsed("createService", {
      unitId: UNIT,
      name: "Massagem",
      price: 150.5,
      durationMinutes: 60,
      productIds: [ID_A, ID_B],
      summary: "x",
    });
    expect(grouped(actionFormEntries("createService", input))).toEqual({
      name: ["Massagem"],
      price: ["150.50"],
      durationMinutes: ["60"],
      productId: [ID_A, ID_B],
    });
  });

  it("edição de serviço usa os mesmos campos da criação", () => {
    const input = { unitId: UNIT, serviceId: ID_A, name: "Pedras quentes", price: 200, durationMinutes: 90, productIds: [], summary: "x" };
    expect(grouped(actionFormEntries("updateService", input))).toEqual({
      name: ["Pedras quentes"],
      price: ["200.00"],
      durationMinutes: ["90"],
    });
  });

  it("produto: campos opcionais ausentes ficam vazios", () => {
    const input = parsed("createProduct", { unitId: UNIT, name: "Óleo", quantity: 3, cost: 20, summary: "x" });
    expect(grouped(actionFormEntries("createProduct", input))).toEqual({
      name: ["Óleo"],
      quantity: ["3"],
      cost: ["20.00"],
      notes: [""],
      rating: [""],
      avatarUrl: [""],
    });
  });

  it("produto: avaliação e observações preenchidas", () => {
    const input = parsed("createProduct", {
      unitId: UNIT,
      name: "Óleo",
      quantity: 3,
      cost: 20,
      rating: 4,
      notes: "Fornecedor novo",
      summary: "x",
    });
    expect(grouped(actionFormEntries("createProduct", input))).toMatchObject({ rating: ["4"], notes: ["Fornecedor novo"] });
  });

  it("agendamento: inclui a unidade e os produtos", () => {
    const input = parsed("createBooking", {
      unitId: UNIT,
      therapistId: ID_A,
      serviceId: ID_B,
      treatmentRoomId: ID_A,
      guestName: "Ana",
      room: "101",
      startsAt: "2026-09-30T14:00",
      durationMinutes: 60,
      productIds: [ID_B],
      summary: "x",
    });
    expect(grouped(actionFormEntries("createBooking", input))).toEqual({
      unitId: [UNIT],
      therapistId: [ID_A],
      serviceId: [ID_B],
      treatmentRoomId: [ID_A],
      guestName: ["Ana"],
      room: ["101"],
      startsAt: ["2026-09-30T14:00"],
      durationMinutes: ["60"],
      productId: [ID_B],
      color: [""],
    });
  });

  it("atendimento: um campo por serviço, massagista e produto", () => {
    const input = parsed("createAppointment", {
      unitId: UNIT,
      guestName: "Ana",
      room: "101",
      performedAt: "2026-09-30T14:00",
      serviceIds: [ID_A, ID_B],
      therapistIds: [ID_A],
      summary: "x",
    });
    expect(grouped(actionFormEntries("createAppointment", input))).toEqual({
      guestName: ["Ana"],
      room: ["101"],
      performedAt: ["2026-09-30T14:00"],
      serviceId: [ID_A, ID_B],
      therapistId: [ID_A],
    });
  });

  it("despesa paga e parcelada", () => {
    const input = parsed("createExpense", {
      unitId: UNIT,
      groupId: ID_A,
      description: "Toalhas",
      amount: 99.9,
      date: "2026-09-20",
      paid: true,
      repeat: "installments",
      count: 3,
      summary: "x",
    });
    expect(grouped(actionFormEntries("createExpense", input))).toEqual({
      groupId: [ID_A],
      description: ["Toalhas"],
      amount: ["99.90"],
      date: ["2026-09-20"],
      paid: ["on"],
      repeat: ["installments"],
      count: ["3"],
    });
  });

  it("despesa em aberto e sem repetição", () => {
    const input = parsed("createExpense", {
      unitId: UNIT,
      groupId: ID_A,
      description: "Toalhas",
      amount: 80,
      date: "2026-09-20",
      paid: false,
      summary: "x",
    });
    expect(grouped(actionFormEntries("createExpense", input))).toEqual({
      groupId: [ID_A],
      description: ["Toalhas"],
      amount: ["80.00"],
      date: ["2026-09-20"],
      repeat: ["none"],
    });
  });

  it("membros, ticket e resposta ao cliente", () => {
    expect(grouped(actionFormEntries("inviteMember", parsed("inviteMember", { email: "a@b.com", role: "admin", summary: "x" })))).toEqual({
      email: ["a@b.com"],
      role: ["admin"],
    });
    expect(
      grouped(actionFormEntries("updateMember", parsed("updateMember", { memberId: ID_A, name: "Bia", role: "massage_therapist", summary: "x" }))),
    ).toEqual({ name: ["Bia"], role: ["massage_therapist"] });
    expect(
      grouped(actionFormEntries("createTicket", parsed("createTicket", { type: "bug", title: "Erro", description: "Detalhes", summary: "x" }))),
    ).toEqual({ type: ["bug"], title: ["Erro"], description: ["Detalhes"] });
    expect(
      grouped(actionFormEntries("sendReply", parsed("sendReply", { conversationId: ID_A, text: "Oi, Ana!", summary: "x" }))),
    ).toEqual({ text: ["Oi, Ana!"] });
  });

  it("ações sem formulário não geram campos", () => {
    expect(actionFormEntries("deleteService", parsed("deleteService", { unitId: UNIT, serviceId: ID_A, summary: "x" }))).toEqual([]);
  });
});

describe("mergePatch", () => {
  it("aplica só os campos informados; null limpa o campo", () => {
    expect(mergePatch({ name: "Óleo", quantity: 3, notes: "a" }, { name: undefined, quantity: 5, notes: null })).toEqual({
      name: "Óleo",
      quantity: 5,
      notes: null,
    });
  });

  it("não altera o objeto original", () => {
    const current = { name: "Óleo" };
    mergePatch(current, { name: "Creme" });
    expect(current).toEqual({ name: "Óleo" });
  });
});
