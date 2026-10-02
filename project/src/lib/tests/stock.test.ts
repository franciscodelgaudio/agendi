import { describe, it, expect, vi } from "vitest";
import { createStock, deleteStock, mergeStockItems, staleStockWalletLinks, updateStock } from "@/service/workspace/[workspaceId]/stock/stock";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const STOCK_ID = "64b7f0c2a1b2c3d4e5f60790";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";
const UNIT_C = "64b7f0c2a1b2c3d4e5f60722";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60730";
const PRODUCT_1 = "64b7f0c2a1b2c3d4e5f60800";
const PRODUCT_2 = "64b7f0c2a1b2c3d4e5f60801";

// Como chega do FormData: as unidades marcadas e, opcional, a carteira que paga as compras.
const input = { name: "Estoque central", units: [UNIT_A, UNIT_B] };

// walletUnits: unidades da carteira do workspace; null quando ela não existe nele.
function makeDeps({ exist = true, walletUnits = [UNIT_A, UNIT_B] as string[] | null } = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ id: STOCK_ID }),
    update: vi.fn().mockResolvedValue(true),
    unitsExist: vi.fn().mockResolvedValue(exist),
    findWalletUnits: vi.fn().mockResolvedValue(walletUnits),
  };
}

describe("createStock", () => {
  it("cria o estoque compartilhado com as unidades", async () => {
    const deps = makeDeps();

    const result = await createStock(input, WORKSPACE_ID, deps);

    expect(result).toEqual({ ok: true, stockId: STOCK_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Estoque central",
      units: [{ unitId: UNIT_A }, { unitId: UNIT_B }],
      walletId: null,
      workspaceId: WORKSPACE_ID,
    });
    expect(deps.findWalletUnits).not.toHaveBeenCalled();
  });

  it("liga o estoque à carteira que tem todas as unidades dele", async () => {
    const deps = makeDeps({ walletUnits: [UNIT_A, UNIT_B, UNIT_C] });

    const result = await createStock({ ...input, walletId: WALLET_ID }, WORKSPACE_ID, deps);

    expect(result).toEqual({ ok: true, stockId: STOCK_ID });
    expect(deps.findWalletUnits).toHaveBeenCalledWith(WORKSPACE_ID, WALLET_ID);
    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ walletId: WALLET_ID }));
  });

  it.each(["", null, undefined])("carteira %j deixa o estoque sem carteira", async (walletId) => {
    const deps = makeDeps();

    await createStock({ ...input, walletId }, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ walletId: null }));
  });

  it("recusa a carteira que não tem todas as unidades do estoque", async () => {
    const deps = makeDeps({ walletUnits: [UNIT_A] });

    expect(await createStock({ ...input, walletId: WALLET_ID }, WORKSPACE_ID, deps)).toEqual({
      ok: false,
      error: "wallet_missing_units",
    });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa a carteira que não é do workspace", async () => {
    const deps = makeDeps({ walletUnits: null });

    expect(await createStock({ ...input, walletId: WALLET_ID }, WORKSPACE_ID, deps)).toEqual({
      ok: false,
      error: "wallet_not_found",
    });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["que não é texto", 5],
    ["com id inválido", "x"],
  ])("recusa carteira %s", async (_label, walletId) => {
    const deps = makeDeps();

    expect(await createStock({ ...input, walletId }, WORKSPACE_ID, deps)).toEqual({
      ok: false,
      error: "wallet_not_found",
    });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("remove espaços das pontas do nome", async () => {
    const deps = makeDeps();

    await createStock({ ...input, name: "  Estoque central  " }, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Estoque central" }));
  });

  it("confere as unidades no workspace", async () => {
    const deps = makeDeps();

    await createStock(input, WORKSPACE_ID, deps);

    expect(deps.unitsExist).toHaveBeenCalledWith(WORKSPACE_ID, [UNIT_A, UNIT_B]);
  });

  it("sem workspace, não grava", async () => {
    const deps = makeDeps();

    expect(await createStock(input, null, deps)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["nome vazio", { ...input, name: "   " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { ...input, name: "a".repeat(41) }, "name_too_long"],
    ["nome que não é texto", { ...input, name: 1 }, "invalid_input"],
    ["sem unidades", { ...input, units: [] }, "no_units"],
    ["unidades que não são lista", { ...input, units: "x" }, "invalid_input"],
    ["unidade repetida", { ...input, units: [UNIT_A, UNIT_A] }, "invalid_input"],
    ["unidade que não é texto", { ...input, units: [1] }, "invalid_input"],
    ["id de unidade inválido", { ...input, units: ["x"] }, "invalid_units"],
  ])("recusa %s", async (_label, stockInput, error) => {
    const deps = makeDeps();

    expect(await createStock(stockInput, WORKSPACE_ID, deps)).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que não é do workspace", async () => {
    const deps = makeDeps({ exist: false });

    expect(await createStock(input, WORKSPACE_ID, deps)).toEqual({ ok: false, error: "invalid_units" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateStock", () => {
  it("grava nome e unidades", async () => {
    const deps = makeDeps();

    const result = await updateStock({ name: "Novo nome", units: [UNIT_A, UNIT_C] }, WORKSPACE_ID, STOCK_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.unitsExist).toHaveBeenCalledWith(WORKSPACE_ID, [UNIT_A, UNIT_C]);
    expect(deps.update).toHaveBeenCalledWith(STOCK_ID, {
      name: "Novo nome",
      units: [{ unitId: UNIT_A }, { unitId: UNIT_C }],
      walletId: null,
    });
  });

  it("grava a carteira que tem todas as unidades", async () => {
    const deps = makeDeps();

    expect(await updateStock({ ...input, walletId: WALLET_ID }, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(STOCK_ID, expect.objectContaining({ walletId: WALLET_ID }));
  });

  it("recusa a carteira que deixou de ter todas as unidades marcadas", async () => {
    const deps = makeDeps({ walletUnits: [UNIT_A, UNIT_B] });

    expect(
      await updateStock({ name: "Novo nome", units: [UNIT_A, UNIT_C], walletId: WALLET_ID }, WORKSPACE_ID, STOCK_ID, deps),
    ).toEqual({ ok: false, error: "wallet_missing_units" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa entrada inválida", async () => {
    const deps = makeDeps();

    expect(await updateStock({ ...input, units: [] }, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "no_units",
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa unidade que não é do workspace", async () => {
    const deps = makeDeps({ exist: false });

    expect(await updateStock(input, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: false, error: "invalid_units" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem workspace", null, STOCK_ID],
    ["sem estoque", WORKSPACE_ID, null],
  ])("%s, devolve não encontrado", async (_label, workspaceId, stockId) => {
    const deps = makeDeps();

    expect(await updateStock(input, workspaceId, stockId, deps)).toEqual({ ok: false, error: "stock_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("devolve não encontrado quando a escrita não acha o estoque", async () => {
    const deps = makeDeps();
    deps.update.mockResolvedValue(false);

    expect(await updateStock(input, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: false, error: "stock_not_found" });
  });
});

describe("deleteStock", () => {
  // Como chega do FormData: a unidade que fica com as quantidades do estoque.
  const deleteInput = { unitId: UNIT_B };

  function makeDeleteDeps(unitIds: string[] | null = [UNIT_A, UNIT_B]) {
    return {
      findUnitIds: vi.fn().mockResolvedValue(unitIds),
      remove: vi.fn().mockResolvedValue(true),
    };
  }

  it("exclui o estoque e passa as quantidades para a unidade escolhida", async () => {
    const deps = makeDeleteDeps();

    expect(await deleteStock(deleteInput, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: true });
    expect(deps.findUnitIds).toHaveBeenCalledWith(WORKSPACE_ID, STOCK_ID);
    expect(deps.remove).toHaveBeenCalledWith(STOCK_ID, UNIT_B);
  });

  it.each([
    ["unidade que não é texto", { unitId: 1 }, "invalid_input"],
    ["sem unidade", {}, "invalid_input"],
    ["unidade que não é do estoque", { unitId: UNIT_C }, "invalid_units"],
  ])("recusa %s", async (_label, removeInput, error) => {
    const deps = makeDeleteDeps();

    expect(await deleteStock(removeInput, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: false, error });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem workspace", null, STOCK_ID],
    ["sem estoque", WORKSPACE_ID, null],
  ])("%s, devolve não encontrado", async (_label, workspaceId, stockId) => {
    const deps = makeDeleteDeps();

    expect(await deleteStock(deleteInput, workspaceId, stockId, deps)).toEqual({ ok: false, error: "stock_not_found" });
    expect(deps.findUnitIds).not.toHaveBeenCalled();
  });

  it("estoque que não é do workspace devolve não encontrado", async () => {
    const deps = makeDeleteDeps(null);

    expect(await deleteStock(deleteInput, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "stock_not_found",
    });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("devolve não encontrado quando a remoção não acha o estoque", async () => {
    const deps = makeDeleteDeps();
    deps.remove.mockResolvedValue(false);

    expect(await deleteStock(deleteInput, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "stock_not_found",
    });
  });
});

// Unidades que entram num estoque compartilhado levam o que têm: o mesmo produto vira um item
// só, com os lotes de todos em ordem de compra e todas as vezes que acabou.
describe("mergeStockItems", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 8, d));
  const lot = (quantity: number, unitCostCents: number, d: number) => ({ quantity, unitCostCents, purchasedAt: day(d) });

  it("junta os lotes do mesmo produto em ordem de compra e as datas em que acabou, em ordem", () => {
    expect(
      mergeStockItems([
        { productId: PRODUCT_1, lots: [lot(3, 2000, 4)], depletedAt: [day(5)] },
        { productId: PRODUCT_2, lots: [lot(1, 500, 1)], depletedAt: [] },
        { productId: PRODUCT_1, lots: [lot(2, 1800, 1), lot(2, 3000, 8)], depletedAt: [day(2), day(9)] },
      ]),
    ).toEqual([
      {
        productId: PRODUCT_1,
        lots: [lot(2, 1800, 1), lot(3, 2000, 4), lot(2, 3000, 8)],
        depletedAt: [day(2), day(5), day(9)],
      },
      { productId: PRODUCT_2, lots: [lot(1, 500, 1)], depletedAt: [] },
    ]);
  });

  it("sem itens, nada a juntar", () => {
    expect(mergeStockItems([])).toEqual([]);
  });

  it("não altera os itens recebidos", () => {
    const depletedAt = [day(9), day(2)];
    const lots = [lot(1, 100, 9), lot(1, 100, 2)];

    mergeStockItems([{ productId: PRODUCT_1, lots, depletedAt }]);

    expect(depletedAt).toEqual([day(9), day(2)]);
    expect(lots).toEqual([lot(1, 100, 9), lot(1, 100, 2)]);
  });
});

// Estoque ligado a carteira que não existe mais ou que deixou de ter todas as unidades dele perde a ligação.
describe("staleStockWalletLinks", () => {
  const wallets = [{ id: WALLET_ID, unitIds: [UNIT_A, UNIT_B] }];

  it("mantém o estoque cuja carteira tem todas as unidades dele, mesmo com outras a mais", () => {
    expect(staleStockWalletLinks([{ id: STOCK_ID, walletId: WALLET_ID, unitIds: [UNIT_A] }], wallets)).toEqual([]);
  });

  it("devolve o estoque com unidade que não está na carteira", () => {
    expect(
      staleStockWalletLinks([{ id: STOCK_ID, walletId: WALLET_ID, unitIds: [UNIT_A, UNIT_C] }], wallets),
    ).toEqual([STOCK_ID]);
  });

  it("devolve o estoque ligado a carteira que não existe mais", () => {
    expect(staleStockWalletLinks([{ id: STOCK_ID, walletId: WALLET_ID, unitIds: [UNIT_A] }], [])).toEqual([STOCK_ID]);
  });

  it("ignora o estoque sem carteira", () => {
    expect(staleStockWalletLinks([{ id: STOCK_ID, walletId: null, unitIds: [UNIT_C] }], wallets)).toEqual([]);
  });
});
