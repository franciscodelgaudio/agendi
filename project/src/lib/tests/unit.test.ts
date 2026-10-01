import { describe, it, expect, vi } from "vitest";
import { createUnit, deleteUnit, updateUnit } from "@/service/workspace/[workspaceId]/unit/unit";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";

// Unidade dentro de um estabelecimento parceiro: regra de repasse como chega do
// formulário e como é salva.
const SHARE_INPUT = { period: "monthly", limits: [], percents: ["15"] };
const SHARE = { period: "monthly", tiers: [{ upToCents: null, percent: 15 }] };
// Salas de atendimento como chegam do formulário (id vazio = sala nova) e como são salvas.
const ROOMS_INPUT = { ids: [""], names: ["Sala Single"], beds: ["1"] };
const ROOMS = [{ id: null, name: "Sala Single", beds: 1 }];
// Horário de funcionamento; chega do formulário do mesmo jeito que é salvo.
const HOURS = { opensAt: "08:00", closesAt: "22:00" };
const PARTNER = { ownership: "partner", revenueShare: SHARE_INPUT, treatmentRooms: ROOMS_INPUT, businessHours: HOURS };
const OWN = { ownership: "own", treatmentRooms: ROOMS_INPUT, businessHours: HOURS };

describe("createUnit", () => {
  function makeInsert() {
    return vi.fn().mockResolvedValue({ id: UNIT_ID });
  }

  it("cria a unidade no workspace e retorna o id", async () => {
    const insert = makeInsert();

    const result = await createUnit({ name: "Spa Central", ...OWN }, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(insert).toHaveBeenCalledWith({ name: "Spa Central", treatmentRooms: ROOMS, businessHours: HOURS, workspaceId: WORKSPACE_ID });
  });

  it("remove espaços das pontas do nome e da avatarUrl antes de salvar", async () => {
    const insert = makeInsert();

    await createUnit(
      { name: "  Spa Central  ", avatarUrl: "  https://example.com/a.png  ", ...OWN },
      WORKSPACE_ID,
      insert,
    );

    expect(insert).toHaveBeenCalledWith({
      name: "Spa Central",
      avatarUrl: "https://example.com/a.png",
      treatmentRooms: ROOMS,
      businessHours: HOURS,
      workspaceId: WORKSPACE_ID,
    });
  });

  it.each([
    ["avatarUrl vazia", ""],
    ["avatarUrl só com espaços", "   "],
    ["avatarUrl ausente (null do FormData)", null],
  ])("ignora a avatarUrl quando %s", async (_label, avatarUrl) => {
    const insert = makeInsert();

    const result = await createUnit({ name: "Spa Central", avatarUrl, ...OWN }, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(insert).toHaveBeenCalledWith({ name: "Spa Central", treatmentRooms: ROOMS, businessHours: HOURS, workspaceId: WORKSPACE_ID });
  });

  it("unidade dentro de estabelecimento parceiro salva a regra de repasse", async () => {
    const insert = makeInsert();

    const result = await createUnit({ name: "Spa Resort", ...PARTNER }, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(insert).toHaveBeenCalledWith({ name: "Spa Resort", revenueShare: SHARE, treatmentRooms: ROOMS, businessHours: HOURS, workspaceId: WORKSPACE_ID });
  });

  it("unidade em espaço próprio ignora regra de repasse enviada", async () => {
    const insert = makeInsert();

    await createUnit({ name: "Spa Centro", ...OWN, revenueShare: SHARE_INPUT }, WORKSPACE_ID, insert);

    expect(insert).toHaveBeenCalledWith({ name: "Spa Centro", treatmentRooms: ROOMS, businessHours: HOURS, workspaceId: WORKSPACE_ID });
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    const insert = makeInsert();

    const result = await createUnit({ name: "a".repeat(80), ...OWN }, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
  });

  it.each([
    ["nome ausente", {}, "invalid_input"],
    ["nome não é string", { name: 123 }, "invalid_input"],
    ["input nulo", null, "invalid_input"],
    ["avatarUrl não é string", { name: "Spa Central", avatarUrl: 123 }, "invalid_input"],
    ["nome vazio", { name: "" }, "invalid_name"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
    ["avatarUrl que não é URL", { name: "Spa Central", avatarUrl: "logo.png" }, "invalid_avatar_url"],
    ["avatarUrl sem http(s)", { name: "Spa Central", avatarUrl: "javascript:alert(1)" }, "invalid_avatar_url"],
    ["tipo de unidade ausente", { name: "Spa Central" }, "invalid_ownership"],
    ["tipo de unidade desconhecido", { name: "Spa Central", ownership: "franchise" }, "invalid_ownership"],
    ["parceiro sem regra de repasse", { name: "Spa Central", ownership: "partner" }, "invalid_input"],
    ["parceiro com período inválido", { name: "Spa Central", ...PARTNER, revenueShare: { ...SHARE_INPUT, period: "yearly" } }, "invalid_period"],
    ["parceiro com percentual inválido", { name: "Spa Central", ...PARTNER, revenueShare: { ...SHARE_INPUT, percents: ["101"] } }, "invalid_tier_percent"],
    ["salas ausentes", { name: "Spa Central", ownership: "own" }, "invalid_input"],
    ["nenhuma sala", { name: "Spa Central", ...OWN, treatmentRooms: { ids: [], names: [], beds: [] } }, "no_treatment_rooms"],
    ["sala sem maca", { name: "Spa Central", ...OWN, treatmentRooms: { ...ROOMS_INPUT, beds: ["0"] } }, "invalid_treatment_room_beds"],
    ["horário ausente", { name: "Spa Central", ownership: "own", treatmentRooms: ROOMS_INPUT }, "invalid_input"],
    ["horário inválido", { name: "Spa Central", ...OWN, businessHours: { opensAt: "8h", closesAt: "22:00" } }, "invalid_business_hours"],
    ["fechamento antes da abertura", { name: "Spa Central", ...OWN, businessHours: { opensAt: "22:00", closesAt: "08:00" } }, "invalid_business_hours_order"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const insert = makeInsert();

    const result = await createUnit(input, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna workspace_not_found sem salvar quando não há workspaceId (%j)",
    async (workspaceId) => {
      const insert = makeInsert();

      const result = await createUnit({ name: "Spa Central", ...OWN }, workspaceId, insert);

      expect(result).toEqual({ ok: false, error: "workspace_not_found" });
      expect(insert).not.toHaveBeenCalled();
    },
  );
});

describe("updateUnit", () => {
  function makeUpdate(found = true) {
    return vi.fn().mockResolvedValue(found);
  }

  // true quando alguma sala que sai da unidade ainda tem agendamento por terminar.
  function makeRoomCheck(inUse = false) {
    return vi.fn().mockResolvedValue(inUse);
  }

  it("atualiza a unidade com nome e avatarUrl sem espaços nas pontas", async () => {
    const update = makeUpdate();

    const result = await updateUnit(
      { name: "  Spa Central  ", avatarUrl: "  https://example.com/a.png  ", ...OWN },
      UNIT_ID,
      update,
      makeRoomCheck(),
    );

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(UNIT_ID, {
      name: "Spa Central",
      avatarUrl: "https://example.com/a.png",
      revenueShare: null,
      treatmentRooms: ROOMS,
      businessHours: HOURS,
    });
  });

  it("salva a regra de repasse quando a unidade é de estabelecimento parceiro", async () => {
    const update = makeUpdate();

    const result = await updateUnit({ name: "Spa Resort", ...PARTNER }, UNIT_ID, update, makeRoomCheck());

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(UNIT_ID, { name: "Spa Resort", avatarUrl: null, revenueShare: SHARE, treatmentRooms: ROOMS, businessHours: HOURS });
  });

  it("remove a regra de repasse (revenueShare null) quando a unidade passa a ser própria", async () => {
    const update = makeUpdate();

    await updateUnit({ name: "Spa Centro", ...OWN, revenueShare: SHARE_INPUT }, UNIT_ID, update, makeRoomCheck());

    expect(update).toHaveBeenCalledWith(UNIT_ID, { name: "Spa Centro", avatarUrl: null, revenueShare: null, treatmentRooms: ROOMS, businessHours: HOURS });
  });

  // Sala com id é mantida (e seus agendamentos continuam nela); sem id é criada.
  it("repassa as salas existentes com o id e as novas com id null", async () => {
    const update = makeUpdate();
    const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";

    await updateUnit(
      { name: "Spa Central", ...OWN, treatmentRooms: { ids: [SINGLE_ID, ""], names: ["Sala Single", "Sala Casal"], beds: ["1", "2"] } },
      UNIT_ID,
      update,
      makeRoomCheck(),
    );

    expect(update).toHaveBeenCalledWith(UNIT_ID, {
      name: "Spa Central",
      avatarUrl: null,
      revenueShare: null,
      treatmentRooms: [
        { id: SINGLE_ID, name: "Sala Single", beds: 1 },
        { id: null, name: "Sala Casal", beds: 2 },
      ],
      businessHours: HOURS,
    });
  });

  it.each([
    ["avatarUrl vazia", ""],
    ["avatarUrl só com espaços", "   "],
    ["avatarUrl ausente (null do FormData)", null],
  ])("remove o avatar (avatarUrl null) quando %s", async (_label, avatarUrl) => {
    const update = makeUpdate();

    const result = await updateUnit({ name: "Spa Central", avatarUrl, ...OWN }, UNIT_ID, update, makeRoomCheck());

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(UNIT_ID, { name: "Spa Central", avatarUrl: null, revenueShare: null, treatmentRooms: ROOMS, businessHours: HOURS });
  });

  it.each([
    ["nome ausente", {}, "invalid_input"],
    ["input nulo", null, "invalid_input"],
    ["avatarUrl não é string", { name: "Spa Central", avatarUrl: 123 }, "invalid_input"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
    ["avatarUrl sem http(s)", { name: "Spa Central", avatarUrl: "javascript:alert(1)" }, "invalid_avatar_url"],
    ["tipo de unidade ausente", { name: "Spa Central" }, "invalid_ownership"],
    ["parceiro com limite inválido", { name: "Spa Central", ...PARTNER, revenueShare: { ...SHARE_INPUT, limits: ["0"], percents: ["30", "35"] } }, "invalid_tier_limit"],
    ["salas ausentes", { name: "Spa Central", ownership: "own" }, "invalid_input"],
    ["sala com nome repetido", { name: "Spa Central", ...OWN, treatmentRooms: { ids: ["", ""], names: ["Sala 1", "Sala 1"], beds: ["1", "2"] } }, "duplicate_treatment_room_name"],
    ["fechamento igual à abertura", { name: "Spa Central", ...OWN, businessHours: { opensAt: "10:00", closesAt: "10:00" } }, "invalid_business_hours_order"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const update = makeUpdate();

    const result = await updateUnit(input, UNIT_ID, update, makeRoomCheck());

    expect(result).toEqual({ ok: false, error });
    expect(update).not.toHaveBeenCalled();
  });

  // Salas que ficam: as que vêm com id. As novas (sem id) ainda não têm agendamentos.
  it("confere agendamentos nas salas removidas, informando as que ficam", async () => {
    const roomCheck = makeRoomCheck();
    const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";

    await updateUnit(
      { name: "Spa Central", ...OWN, treatmentRooms: { ids: [SINGLE_ID, ""], names: ["Sala Single", "Sala Casal"], beds: ["1", "2"] } },
      UNIT_ID,
      makeUpdate(),
      roomCheck,
    );

    expect(roomCheck).toHaveBeenCalledWith(UNIT_ID, [SINGLE_ID]);
  });

  it("retorna treatment_room_in_use sem salvar quando uma sala removida tem agendamento por terminar", async () => {
    const update = makeUpdate();

    const result = await updateUnit({ name: "Spa Central", ...OWN }, UNIT_ID, update, makeRoomCheck(true));

    expect(result).toEqual({ ok: false, error: "treatment_room_in_use" });
    expect(update).not.toHaveBeenCalled();
  });

  it("não confere agendamentos quando o input é inválido", async () => {
    const roomCheck = makeRoomCheck();

    await updateUnit({ name: "   ", ...OWN }, UNIT_ID, makeUpdate(), roomCheck);

    expect(roomCheck).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna unit_not_found sem salvar quando não há unitId (%j)",
    async (unitId) => {
      const update = makeUpdate();

      const result = await updateUnit({ name: "Spa Central", ...OWN }, unitId, update, makeRoomCheck());

      expect(result).toEqual({ ok: false, error: "unit_not_found" });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await updateUnit({ name: "Spa Central", ...OWN }, UNIT_ID, makeUpdate(false), makeRoomCheck());

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });
});

describe("deleteUnit", () => {
  it("exclui a unidade pelo id", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteUnit(UNIT_ID, remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(UNIT_ID);
  });

  it.each([undefined, null, ""])(
    "retorna unit_not_found sem excluir quando não há unitId (%j)",
    async (unitId) => {
      const remove = vi.fn().mockResolvedValue(true);

      const result = await deleteUnit(unitId, remove);

      expect(result).toEqual({ ok: false, error: "unit_not_found" });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await deleteUnit(UNIT_ID, vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });
});

describe("createUnit com saldo inicial", () => {
  it("salva o saldo em caixa informado na criação", async () => {
    const insert = vi.fn().mockResolvedValue({ id: UNIT_ID });

    const result = await createUnit(
      { name: "Spa Central", ...OWN, openingBalance: { amount: "2500.00", date: "2026-09-01" } },
      WORKSPACE_ID,
      insert,
    );

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(insert).toHaveBeenCalledWith({
      name: "Spa Central",
      treatmentRooms: ROOMS,
      businessHours: HOURS,
      openingBalance: { amountCents: 250_000, date: "2026-09-01" },
      workspaceId: WORKSPACE_ID,
    });
  });

  it("sem valor, cria a unidade sem saldo inicial", async () => {
    const insert = vi.fn().mockResolvedValue({ id: UNIT_ID });

    await createUnit({ name: "Spa Central", ...OWN, openingBalance: { amount: "", date: "" } }, WORKSPACE_ID, insert);

    expect(insert).toHaveBeenCalledWith({ name: "Spa Central", treatmentRooms: ROOMS, businessHours: HOURS, workspaceId: WORKSPACE_ID });
  });

  it.each([
    ["valor inválido", { amount: "abc", date: "2026-09-01" }, "invalid_opening_balance"],
    ["dia inválido", { amount: "100.00", date: "2026-02-30" }, "invalid_opening_balance_date"],
  ])("retorna erro sem salvar quando o saldo tem %s", async (_label, openingBalance, error) => {
    const insert = vi.fn();

    const result = await createUnit({ name: "Spa Central", ...OWN, openingBalance }, WORKSPACE_ID, insert);

    expect(result).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });
});
