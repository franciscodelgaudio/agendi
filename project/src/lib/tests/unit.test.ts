import { describe, it, expect, vi } from "vitest";
import { createUnit, deleteUnit, updateUnit } from "@/service/workspace/[workspaceId]/unit/unit";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const ANA_MEMBER_ID = "64b7f0c2a1b2c3d4e5f60791";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";
const BIA_MEMBER_ID = "64b7f0c2a1b2c3d4e5f60792";

const MANAGER = actorWith("units.manage");

const STATIONS_INPUT = { ids: [""], names: ["Sala Single"], active: ["true"] };
const STATIONS = [{ id: null, name: "Sala Single", active: true }];
const HOURS = { opensAt: "08:00", closesAt: "22:00" };
const BASE = {
  name: "Spa Central",
  stations: STATIONS_INPUT,
  businessHours: HOURS,
  workspaceMemberIds: [],
  walletId: WALLET_ID,
  inventoryId: INVENTORY_ID,
};
const SAVED = {
  name: "Spa Central",
  imageUrl: null,
  stations: STATIONS,
  businessHours: HOURS,
  workspaceMemberIds: [],
  wallet: { id: WALLET_ID },
  inventory: { id: INVENTORY_ID },
};

describe("createUnit", () => {
  function makeDeps({ membersExist = true, walletExists = true, inventoryExists = true } = {}) {
    return {
      membersExist: vi.fn().mockResolvedValue(membersExist),
      walletExists: vi.fn().mockResolvedValue(walletExists),
      inventoryExists: vi.fn().mockResolvedValue(inventoryExists),
      insert: vi.fn().mockResolvedValue({ id: UNIT_ID }),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

  it("cria a unidade no workspace e retorna o id", async () => {
    const deps = makeDeps();

    const result = await createUnit(BASE, ctx, deps);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ...SAVED });
    expect(deps.walletExists).toHaveBeenCalledWith(WALLET_ID);
    expect(deps.inventoryExists).toHaveBeenCalledWith(INVENTORY_ID);
  });

  it("quem gerencia unidades também cria", async () => {
    const result = await createUnit(BASE, { workspaceId: WORKSPACE_ID, actor: MANAGER }, makeDeps());

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
  });

  it("remove espaços das pontas do nome e da imageUrl antes de salvar", async () => {
    const deps = makeDeps();

    await createUnit({ ...BASE, name: "  Spa Central  ", imageUrl: "  https://example.com/a.png  " }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Spa Central", imageUrl: "https://example.com/a.png" }),
    );
  });

  it.each([
    ["vazia", ""],
    ["só com espaços", "   "],
    ["ausente (null do FormData)", null],
  ])("imageUrl %s fica null", async (_label, imageUrl) => {
    const deps = makeDeps();

    await createUnit({ ...BASE, imageUrl }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null }));
  });

  it("salva os membros da unidade sem repetição, conferindo que são do workspace", async () => {
    const deps = makeDeps();

    await createUnit({ ...BASE, workspaceMemberIds: [ANA_MEMBER_ID, BIA_MEMBER_ID, ANA_MEMBER_ID] }, ctx, deps);

    expect(deps.membersExist).toHaveBeenCalledWith([ANA_MEMBER_ID, BIA_MEMBER_ID]);
    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceMemberIds: [ANA_MEMBER_ID, BIA_MEMBER_ID] }),
    );
  });

  it("sem membros, não consulta os membros do workspace", async () => {
    const deps = makeDeps();

    await createUnit(BASE, ctx, deps);

    expect(deps.membersExist).not.toHaveBeenCalled();
  });

  it("recusa membro que não é do workspace", async () => {
    const deps = makeDeps({ membersExist: false });

    const result = await createUnit({ ...BASE, workspaceMemberIds: [ANA_MEMBER_ID] }, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_members" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    const result = await createUnit({ ...BASE, name: "a".repeat(80) }, ctx, makeDeps());

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", { ...BASE, name: undefined }, "invalid_input"],
    ["nome não é string", { ...BASE, name: 123 }, "invalid_input"],
    ["imageUrl não é string", { ...BASE, imageUrl: 123 }, "invalid_input"],
    ["nome vazio", { ...BASE, name: "" }, "invalid_name"],
    ["nome só com espaços", { ...BASE, name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...BASE, name: "a".repeat(81) }, "name_too_long"],
    ["imageUrl que não é URL", { ...BASE, imageUrl: "logo.png" }, "invalid_image_url"],
    ["imageUrl sem http(s)", { ...BASE, imageUrl: "javascript:alert(1)" }, "invalid_image_url"],
    ["estações ausentes", { ...BASE, stations: undefined }, "invalid_input"],
    ["nenhuma estação", { ...BASE, stations: { ids: [], names: [], active: [] } }, "no_stations"],
    ["estação com nome repetido", { ...BASE, stations: { ids: ["", ""], names: ["A", "a"], active: ["true", "true"] } }, "duplicate_station_name"],
    ["horário ausente", { ...BASE, businessHours: undefined }, "invalid_input"],
    ["horário inválido", { ...BASE, businessHours: { opensAt: "8h", closesAt: "22:00" } }, "invalid_business_hours"],
    ["fechamento antes da abertura", { ...BASE, businessHours: { opensAt: "22:00", closesAt: "08:00" } }, "invalid_business_hours_order"],
    ["membros que não são lista", { ...BASE, workspaceMemberIds: ANA_MEMBER_ID }, "invalid_input"],
    ["membro que não é ObjectId", { ...BASE, workspaceMemberIds: ["ana"] }, "invalid_members"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createUnit(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não cria", async () => {
    const deps = makeDeps();

    const result = await createUnit(BASE, { workspaceId: WORKSPACE_ID, actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar unidades, não cria", async () => {
    const deps = makeDeps();

    const result = await createUnit(BASE, { workspaceId: WORKSPACE_ID, actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("carteira e inventário da unidade", () => {
  function makeDeps({ walletExists = true, inventoryExists = true } = {}) {
    return {
      membersExist: vi.fn().mockResolvedValue(true),
      walletExists: vi.fn().mockResolvedValue(walletExists),
      inventoryExists: vi.fn().mockResolvedValue(inventoryExists),
      insert: vi.fn().mockResolvedValue({ id: UNIT_ID }),
      hasBookingsInRemovedStations: vi.fn().mockResolvedValue(false),
      update: vi.fn().mockResolvedValue(true),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

  it("cria uma carteira nova com o saldo inicial e um inventário novo junto com a unidade", async () => {
    const deps = makeDeps();

    await createUnit(
      {
        ...BASE,
        walletId: "new",
        walletName: "  Caixa Centro  ",
        openingBalance: { amount: "2500.00", date: "2026-09-01" },
        inventoryId: "new",
        inventoryName: " Estoque Centro ",
      },
      ctx,
      deps,
    );

    expect(deps.walletExists).not.toHaveBeenCalled();
    expect(deps.inventoryExists).not.toHaveBeenCalled();
    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: { name: "Caixa Centro", openingBalance: { amountCents: 250_000, date: "2026-09-01" } },
        inventory: { name: "Estoque Centro" },
      }),
    );
  });

  it("carteira nova sem saldo inicial fica sem saldo", async () => {
    const deps = makeDeps();

    await createUnit({ ...BASE, walletId: "new", walletName: "Caixa", openingBalance: { amount: "", date: "" } }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ wallet: { name: "Caixa", openingBalance: null } }));
  });

  it("com carteira existente, ignora o saldo inicial enviado", async () => {
    const deps = makeDeps();

    await createUnit({ ...BASE, openingBalance: { amount: "100", date: "2026-09-01" } }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ wallet: { id: WALLET_ID } }));
  });

  it("ao editar, troca a carteira e o inventário por outros existentes ou novos", async () => {
    const deps = makeDeps();

    await updateUnit({ ...BASE, inventoryId: "new", inventoryName: "Estoque novo" }, UNIT_ID, { actor: ADMIN }, deps);

    expect(deps.update).toHaveBeenCalledWith(
      UNIT_ID,
      expect.objectContaining({ wallet: { id: WALLET_ID }, inventory: { name: "Estoque novo" } }),
    );
  });

  it.each([
    ["carteira ausente", { ...BASE, walletId: undefined }, "invalid_wallet"],
    ["carteira que não é ObjectId", { ...BASE, walletId: "conta" }, "invalid_wallet"],
    ["inventário ausente", { ...BASE, inventoryId: "" }, "invalid_inventory"],
    ["carteira nova sem nome", { ...BASE, walletId: "new", walletName: " " }, "invalid_wallet_name"],
    ["carteira nova com nome longo", { ...BASE, walletId: "new", walletName: "a".repeat(41) }, "wallet_name_too_long"],
    ["inventário novo sem nome", { ...BASE, inventoryId: "new" }, "invalid_inventory_name"],
    ["inventário novo com nome longo", { ...BASE, inventoryId: "new", inventoryName: "a".repeat(41) }, "inventory_name_too_long"],
    ["saldo inicial inválido na carteira nova", { ...BASE, walletId: "new", walletName: "Caixa", openingBalance: { amount: "x", date: "2026-09-01" } }, "invalid_opening_balance"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createUnit(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["carteira", { walletExists: false }, "invalid_wallet"],
    ["inventário", { inventoryExists: false }, "invalid_inventory"],
  ])("recusa %s que não é do workspace", async (_label, options, error) => {
    const deps = makeDeps(options);

    const created = await createUnit(BASE, ctx, deps);
    const updated = await updateUnit(BASE, UNIT_ID, { actor: ADMIN }, deps);

    expect(created).toEqual({ ok: false, error });
    expect(updated).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("updateUnit", () => {
  function makeDeps({ found = true, inUse = false, membersExist = true } = {}) {
    return {
      membersExist: vi.fn().mockResolvedValue(membersExist),
      walletExists: vi.fn().mockResolvedValue(true),
      inventoryExists: vi.fn().mockResolvedValue(true),
      hasBookingsInRemovedStations: vi.fn().mockResolvedValue(inUse),
      update: vi.fn().mockResolvedValue(found),
    };
  }
  const ctx = { actor: ADMIN };

  it("atualiza a unidade com os dados normalizados", async () => {
    const deps = makeDeps();

    const result = await updateUnit(
      { ...BASE, name: "  Spa Central  ", imageUrl: "  https://example.com/a.png  ", workspaceMemberIds: [ANA_MEMBER_ID] },
      UNIT_ID,
      { actor: MANAGER },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, {
      ...SAVED,
      imageUrl: "https://example.com/a.png",
      workspaceMemberIds: [ANA_MEMBER_ID],
    });
  });

  it("imagem vazia e lista de membros vazia apagam os valores salvos", async () => {
    const deps = makeDeps();

    await updateUnit({ ...BASE, imageUrl: "" }, UNIT_ID, ctx, deps);

    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, SAVED);
  });

  it("passa as estações existentes com o id e as novas com id null, ativas ou não", async () => {
    const deps = makeDeps();

    await updateUnit(
      { ...BASE, stations: { ids: [SINGLE_ID, ""], names: ["Sala Single", "Sala Casal"], active: ["false", "true"] } },
      UNIT_ID,
      ctx,
      deps,
    );

    expect(deps.update.mock.calls[0][1].stations).toEqual([
      { id: SINGLE_ID, name: "Sala Single", active: false },
      { id: null, name: "Sala Casal", active: true },
    ]);
  });

  it("confere agendamentos nas estações removidas, informando as que ficam", async () => {
    const deps = makeDeps();

    await updateUnit(
      { ...BASE, stations: { ids: [SINGLE_ID, ""], names: ["Sala Single", "Sala Casal"], active: ["true", "true"] } },
      UNIT_ID,
      ctx,
      deps,
    );

    expect(deps.hasBookingsInRemovedStations).toHaveBeenCalledWith(UNIT_ID, [SINGLE_ID]);
  });

  it("retorna station_in_use sem salvar quando uma estação removida tem agendamento por terminar", async () => {
    const deps = makeDeps({ inUse: true });

    const result = await updateUnit(BASE, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "station_in_use" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa membro que não é do workspace", async () => {
    const deps = makeDeps({ membersExist: false });

    const result = await updateUnit({ ...BASE, workspaceMemberIds: [ANA_MEMBER_ID] }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_members" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome só com espaços", { ...BASE, name: "   " }, "invalid_name"],
    ["imageUrl sem http(s)", { ...BASE, imageUrl: "javascript:alert(1)" }, "invalid_image_url"],
    ["nenhuma estação", { ...BASE, stations: { ids: [], names: [], active: [] } }, "no_stations"],
    ["fechamento igual à abertura", { ...BASE, businessHours: { opensAt: "10:00", closesAt: "10:00" } }, "invalid_business_hours_order"],
  ])("retorna erro sem conferir agendamentos nem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateUnit(input, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.hasBookingsInRemovedStations).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna unit_not_found sem salvar quando não há unitId (%j)", async (unitId) => {
    const deps = makeDeps();

    const result = await updateUnit(BASE, unitId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await updateUnit(BASE, UNIT_ID, ctx, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });

  it("sem acesso ao workspace, não atualiza", async () => {
    const deps = makeDeps();

    const result = await updateUnit(BASE, UNIT_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar unidades, não atualiza", async () => {
    const deps = makeDeps();

    const result = await updateUnit(BASE, UNIT_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteUnit", () => {
  it("exclui a unidade pelo id", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteUnit(UNIT_ID, { actor: MANAGER }, { remove });

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(UNIT_ID);
  });

  it.each([undefined, null, ""])("retorna unit_not_found sem excluir quando não há unitId (%j)", async (unitId) => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteUnit(unitId, { actor: ADMIN }, { remove });

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await deleteUnit(UNIT_ID, { actor: ADMIN }, { remove: vi.fn().mockResolvedValue(false) });

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar unidades", STAFF, "forbidden"],
  ] as const)("%s, não exclui", async (_label, actor, error) => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteUnit(UNIT_ID, { actor }, { remove });

    expect(result).toEqual({ ok: false, error });
    expect(remove).not.toHaveBeenCalled();
  });
});
