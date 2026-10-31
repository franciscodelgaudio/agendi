import { describe, it, expect, vi } from "vitest";
import { setUnitInventory, setUnitWallet } from "@/service/workspace/[workspaceId]/unit/[unitId]/unit-refs";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";

const MANAGER = actorWith("units.manage");

describe("setUnitWallet", () => {
  function makeDeps({ walletExists = true, found = true } = {}) {
    return {
      walletExists: vi.fn().mockResolvedValue(walletExists),
      update: vi.fn().mockResolvedValue(found),
    };
  }
  const ctx = { actor: ADMIN };

  it("vincula uma carteira existente do workspace", async () => {
    const deps = makeDeps();

    const result = await setUnitWallet({ walletId: WALLET_ID }, UNIT_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.walletExists).toHaveBeenCalledWith(WALLET_ID);
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, { id: WALLET_ID });
  });

  it("com carteira existente, ignora o saldo inicial enviado", async () => {
    const deps = makeDeps();

    await setUnitWallet({ walletId: WALLET_ID, openingBalance: { amount: "100", date: "2026-09-01" } }, UNIT_ID, ctx, deps);

    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, { id: WALLET_ID });
  });

  it("cria uma carteira nova com o saldo inicial", async () => {
    const deps = makeDeps();

    const result = await setUnitWallet(
      { walletId: "new", walletName: "  Caixa Centro  ", openingBalance: { amount: "2500.00", date: "2026-09-01" } },
      UNIT_ID,
      ctx,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.walletExists).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, {
      name: "Caixa Centro",
      openingBalance: { amountCents: 250_000, date: "2026-09-01" },
    });
  });

  it("carteira nova sem saldo inicial fica sem saldo", async () => {
    const deps = makeDeps();

    await setUnitWallet({ walletId: "new", walletName: "Caixa", openingBalance: { amount: "", date: "" } }, UNIT_ID, ctx, deps);

    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, { name: "Caixa", openingBalance: null });
  });

  it("com \"none\", desvincula a carteira", async () => {
    const deps = makeDeps();

    const result = await setUnitWallet({ walletId: "none" }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.walletExists).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, null);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["carteira ausente", {}, "invalid_wallet"],
    ["carteira vazia", { walletId: "" }, "invalid_wallet"],
    ["carteira que não é ObjectId", { walletId: "conta" }, "invalid_wallet"],
    ["nome da carteira nova que não é string", { walletId: "new", walletName: 1 }, "invalid_input"],
    ["carteira nova sem nome", { walletId: "new", walletName: " " }, "invalid_wallet_name"],
    ["carteira nova com nome longo", { walletId: "new", walletName: "a".repeat(41) }, "wallet_name_too_long"],
    ["saldo inicial inválido", { walletId: "new", walletName: "Caixa", openingBalance: { amount: "x", date: "2026-09-01" } }, "invalid_opening_balance"],
    ["saldo inicial sem dia", { walletId: "new", walletName: "Caixa", openingBalance: { amount: "10", date: "" } }, "invalid_opening_balance_date"],
  ])("recusa %s sem salvar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await setUnitWallet(input, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa carteira que não é do workspace", async () => {
    const deps = makeDeps({ walletExists: false });

    const result = await setUnitWallet({ walletId: WALLET_ID }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_wallet" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna unit_not_found sem salvar quando não há unitId (%j)", async (unitId) => {
    const deps = makeDeps();

    const result = await setUnitWallet({ walletId: WALLET_ID }, unitId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await setUnitWallet({ walletId: WALLET_ID }, UNIT_ID, ctx, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar unidades", STAFF, "forbidden"],
  ] as const)("%s, não salva", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await setUnitWallet({ walletId: WALLET_ID }, UNIT_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.walletExists).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("setUnitInventory", () => {
  function makeDeps({ inventoryExists = true, found = true } = {}) {
    return {
      inventoryExists: vi.fn().mockResolvedValue(inventoryExists),
      update: vi.fn().mockResolvedValue(found),
    };
  }
  const ctx = { actor: ADMIN };

  it("vincula um inventário existente do workspace", async () => {
    const deps = makeDeps();

    const result = await setUnitInventory({ inventoryId: INVENTORY_ID }, UNIT_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.inventoryExists).toHaveBeenCalledWith(INVENTORY_ID);
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, { id: INVENTORY_ID });
  });

  it("cria um inventário novo", async () => {
    const deps = makeDeps();

    const result = await setUnitInventory({ inventoryId: "new", inventoryName: " Estoque Centro " }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.inventoryExists).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, { name: "Estoque Centro" });
  });

  it("com \"none\", desvincula o inventário", async () => {
    const deps = makeDeps();

    const result = await setUnitInventory({ inventoryId: "none" }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.inventoryExists).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(UNIT_ID, null);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["inventário ausente", {}, "invalid_inventory"],
    ["inventário vazio", { inventoryId: "" }, "invalid_inventory"],
    ["inventário que não é ObjectId", { inventoryId: "estoque" }, "invalid_inventory"],
    ["nome do inventário novo que não é string", { inventoryId: "new", inventoryName: 1 }, "invalid_input"],
    ["inventário novo sem nome", { inventoryId: "new" }, "invalid_inventory_name"],
    ["inventário novo com nome longo", { inventoryId: "new", inventoryName: "a".repeat(41) }, "inventory_name_too_long"],
  ])("recusa %s sem salvar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await setUnitInventory(input, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa inventário que não é do workspace", async () => {
    const deps = makeDeps({ inventoryExists: false });

    const result = await setUnitInventory({ inventoryId: INVENTORY_ID }, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_inventory" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna unit_not_found sem salvar quando não há unitId (%j)", async (unitId) => {
    const deps = makeDeps();

    const result = await setUnitInventory({ inventoryId: INVENTORY_ID }, unitId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna unit_not_found quando a unidade não existe (ou não é do workspace)", async () => {
    const result = await setUnitInventory({ inventoryId: INVENTORY_ID }, UNIT_ID, ctx, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar unidades", STAFF, "forbidden"],
  ] as const)("%s, não salva", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await setUnitInventory({ inventoryId: INVENTORY_ID }, UNIT_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.inventoryExists).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});
