import { describe, it, expect, vi } from "vitest";
import { setupUnit } from "@/service/workspace/[workspaceId]/unit/unit-setup";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60850";
const ANA_MEMBER_ID = "64b7f0c2a1b2c3d4e5f60791";

const SETUP_MANAGER = actorWith("units.manage", "services.manage", "partners.manage");

const UNIT = {
  name: "Centro",
  imageUrl: null,
  stations: { types: ["Sala"], quantities: ["2"] },
  businessHours: { opensAt: "08:00", closesAt: "20:00" },
  workspaceMemberIds: [ANA_MEMBER_ID],
};
const SERVICES = [
  { name: "Massagem relaxante", duration: "60", price: "180" },
  { name: "Reflexologia", duration: "40", price: "120.50" },
];
const PARTNER = {
  name: "Clínica Bem Viver",
  thresholdRule: "above",
  tiers: [
    { threshold: "0", share: "30" },
    { threshold: "10000", share: "25" },
  ],
};
const INPUT = {
  wallet: { walletId: "new", walletName: "Caixa Centro", openingBalance: { amount: "150", date: "2026-11-02" } },
  inventory: { inventoryId: "new", inventoryName: "Estoque Centro" },
  services: SERVICES,
  partner: PARTNER,
  unit: UNIT,
};

function makeDeps({ membersExist = true, walletExists = true, inventoryExists = true } = {}) {
  return {
    membersExist: vi.fn().mockResolvedValue(membersExist),
    walletExists: vi.fn().mockResolvedValue(walletExists),
    inventoryExists: vi.fn().mockResolvedValue(inventoryExists),
    save: vi.fn().mockResolvedValue({ id: UNIT_ID }),
  };
}

const ctx = { workspaceId: WORKSPACE_ID, actor: SETUP_MANAGER };

describe("setupUnit", () => {
  it("grava de uma vez a carteira, o estoque, os serviços, o repasse e a unidade", async () => {
    const deps = makeDeps();

    const result = await setupUnit(INPUT, ctx, deps);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(deps.membersExist).toHaveBeenCalledWith([ANA_MEMBER_ID]);
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.save).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      wallet: { name: "Caixa Centro", openingBalance: { amountCents: 15_000, date: "2026-11-02" } },
      inventory: { name: "Estoque Centro" },
      services: [
        { name: "Massagem relaxante", durationMinutes: 60, priceCents: 18_000 },
        { name: "Reflexologia", durationMinutes: 40, priceCents: 12_050 },
      ],
      partner: {
        name: "Clínica Bem Viver",
        thresholdRule: "above",
        tiers: [
          { thresholdCents: 0, shareBps: 3000 },
          { thresholdCents: 1_000_000, shareBps: 2500 },
        ],
      },
      unit: {
        name: "Centro",
        imageUrl: null,
        stations: [
          { id: null, type: "Sala", number: 1 },
          { id: null, type: "Sala", number: 2 },
        ],
        businessHours: { opensAt: "08:00", closesAt: "20:00" },
        workspaceMemberIds: [ANA_MEMBER_ID],
      },
    });
  });

  it("usa a carteira e o estoque que já existem no workspace", async () => {
    const deps = makeDeps();

    await setupUnit(
      { ...INPUT, wallet: { walletId: WALLET_ID }, inventory: { inventoryId: INVENTORY_ID } },
      ctx,
      deps,
    );

    expect(deps.walletExists).toHaveBeenCalledWith(WALLET_ID);
    expect(deps.inventoryExists).toHaveBeenCalledWith(INVENTORY_ID);
    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: { id: WALLET_ID }, inventory: { id: INVENTORY_ID } }),
    );
  });

  it("nova carteira sem saldo inicial fica sem saldo", async () => {
    const deps = makeDeps();

    await setupUnit({ ...INPUT, wallet: { walletId: "new", walletName: "Caixa Centro" } }, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: { name: "Caixa Centro", openingBalance: null } }),
    );
  });

  it("unidade que não controla estoque fica sem estoque", async () => {
    const deps = makeDeps();

    await setupUnit({ ...INPUT, inventory: { inventoryId: "none" } }, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ inventory: null }));
  });

  it.each([
    ["sem repasse", null],
    ["repasse pulado", undefined],
  ])("%s grava a unidade sem parceiro", async (_label, partner) => {
    const deps = makeDeps();

    const result = await setupUnit({ ...INPUT, partner }, ctx, deps);

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ partner: null }));
  });

  it("sem repasse, não exige a permissão de parceiros", async () => {
    const deps = makeDeps();

    const result = await setupUnit(
      { ...INPUT, partner: null },
      { workspaceId: WORKSPACE_ID, actor: actorWith("units.manage", "services.manage") },
      deps,
    );

    expect(result).toEqual({ ok: true, unitId: UNIT_ID });
  });

  it.each([
    ["sem carteira", { walletId: "none" }, makeDeps(), "invalid_wallet"],
    ["carteira que não é do workspace", { walletId: WALLET_ID }, makeDeps({ walletExists: false }), "invalid_wallet"],
    ["carteira nova sem nome", { walletId: "new", walletName: " " }, makeDeps(), "invalid_wallet_name"],
    [
      "saldo inicial inválido",
      { walletId: "new", walletName: "Caixa", openingBalance: { amount: "abc", date: "2026-11-02" } },
      makeDeps(),
      "invalid_opening_balance",
    ],
  ])("%s recusa a etapa da carteira", async (_label, wallet, deps, error) => {
    expect(await setupUnit({ ...INPUT, wallet }, ctx, deps)).toEqual({ ok: false, step: "wallet", error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["estoque que não é do workspace", { inventoryId: INVENTORY_ID }, makeDeps({ inventoryExists: false }), "invalid_inventory"],
    ["estoque novo sem nome", { inventoryId: "new", inventoryName: "" }, makeDeps(), "invalid_inventory_name"],
  ])("%s recusa a etapa do estoque", async (_label, inventory, deps, error) => {
    expect(await setupUnit({ ...INPUT, inventory }, ctx, deps)).toEqual({ ok: false, step: "inventory", error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["lista vazia", []],
    ["sem lista", undefined],
  ])("%s de serviços exige pelo menos um", async (_label, services) => {
    const deps = makeDeps();

    expect(await setupUnit({ ...INPUT, services }, ctx, deps)).toEqual({ ok: false, step: "services", error: "no_services" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("aponta qual serviço está inválido", async () => {
    const deps = makeDeps();

    const result = await setupUnit(
      { ...INPUT, services: [SERVICES[0], { name: "Reflexologia", duration: "40", price: "grátis" }] },
      ctx,
      deps,
    );

    expect(result).toEqual({ ok: false, step: "services", error: "invalid_price", index: 1 });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recusa o repasse com faixas inválidas", async () => {
    const deps = makeDeps();

    const result = await setupUnit(
      { ...INPUT, partner: { ...PARTNER, tiers: [{ threshold: "500", share: "30" }] } },
      ctx,
      deps,
    );

    expect(result).toEqual({ ok: false, step: "partner", error: "first_tier_not_zero" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["sem nome", { ...UNIT, name: "" }, makeDeps(), "invalid_name"],
    ["profissional que não é do workspace", UNIT, makeDeps({ membersExist: false }), "invalid_members"],
  ])("unidade %s recusa a etapa da unidade", async (_label, unit, deps, error) => {
    expect(await setupUnit({ ...INPUT, unit }, ctx, deps)).toEqual({ ok: false, step: "unit", error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("aponta a primeira etapa com erro, na ordem do wizard", async () => {
    const deps = makeDeps();

    const result = await setupUnit({ ...INPUT, wallet: { walletId: "none" }, services: [], unit: { ...UNIT, name: "" } }, ctx, deps);

    expect(result).toEqual({ ok: false, step: "wallet", error: "invalid_wallet" });
  });

  it.each([
    ["sem nenhuma permissão", STAFF, INPUT],
    ["sem a permissão de serviços", actorWith("units.manage", "partners.manage"), INPUT],
    ["sem a permissão de unidades", actorWith("services.manage", "partners.manage"), INPUT],
    ["com repasse, sem a permissão de parceiros", actorWith("units.manage", "services.manage"), INPUT],
  ])("%s, não cria", async (_label, actor, input) => {
    const deps = makeDeps();

    expect(await setupUnit(input, { workspaceId: WORKSPACE_ID, actor }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não cria", async () => {
    const deps = makeDeps();

    expect(await setupUnit(INPUT, { workspaceId: WORKSPACE_ID, actor: null }, deps)).toEqual({
      ok: false,
      error: "workspace_not_found",
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("o administrador cria tudo", async () => {
    const deps = makeDeps();

    expect(await setupUnit(INPUT, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps)).toEqual({ ok: true, unitId: UNIT_ID });
  });
});
