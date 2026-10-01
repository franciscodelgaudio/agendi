import { describe, it, expect, vi } from "vitest";
import { createStock, deleteStock, leavesProductsBehind, updateStock } from "@/lib/stock";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const STOCK_ID = "64b7f0c2a1b2c3d4e5f60790";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";
const UNIT_C = "64b7f0c2a1b2c3d4e5f60722";

// Como chega do FormData: as unidades marcadas e o checkbox de estoque distribuído.
const shared = { name: "Estoque central", distributed: null, units: [UNIT_A, UNIT_B] };
const distributed = { ...shared, distributed: "on" };

function makeDeps({
  exist = true,
  leavingWithStock = false,
  currentUnits = [UNIT_A, UNIT_B] as string[] | null,
  holdQuantity = false,
} = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ id: STOCK_ID }),
    update: vi.fn().mockResolvedValue(true),
    unitsExist: vi.fn().mockResolvedValue(exist),
    unitsLeavingWithStock: vi.fn().mockResolvedValue(leavingWithStock),
    findUnitIds: vi.fn().mockResolvedValue(currentUnits),
    unitsHoldQuantity: vi.fn().mockResolvedValue(holdQuantity),
  };
}

describe("createStock", () => {
  it("cria o estoque compartilhado", async () => {
    const deps = makeDeps();

    const result = await createStock(shared, WORKSPACE_ID, deps);

    expect(result).toEqual({ ok: true, stockId: STOCK_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Estoque central",
      distributed: false,
      units: [{ unitId: UNIT_A }, { unitId: UNIT_B }],
      workspaceId: WORKSPACE_ID,
    });
  });

  it("cria o estoque distribuído", async () => {
    const deps = makeDeps();

    await createStock(distributed, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ distributed: true }));
  });

  it("remove espaços das pontas do nome", async () => {
    const deps = makeDeps();

    await createStock({ ...shared, name: "  Estoque central  " }, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Estoque central" }));
  });

  it("confere as unidades no workspace e o estoque de onde elas saem, sem excluir nenhum", async () => {
    const deps = makeDeps();

    await createStock(shared, WORKSPACE_ID, deps);

    expect(deps.unitsExist).toHaveBeenCalledWith(WORKSPACE_ID, [UNIT_A, UNIT_B]);
    expect(deps.unitsLeavingWithStock).toHaveBeenCalledWith([UNIT_A, UNIT_B], null);
  });

  it("sem workspace, não grava", async () => {
    const deps = makeDeps();

    expect(await createStock(shared, null, deps)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["nome vazio", { ...shared, name: "   " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { ...shared, name: "a".repeat(41) }, "name_too_long"],
    ["nome que não é texto", { ...shared, name: 1 }, "invalid_input"],
    ["sem unidades", { ...shared, units: [] }, "no_units"],
    ["unidades que não são lista", { ...shared, units: "x" }, "invalid_input"],
    ["unidade repetida", { ...shared, units: [UNIT_A, UNIT_A] }, "invalid_input"],
    ["unidade que não é texto", { ...shared, units: [1] }, "invalid_input"],
    ["id de unidade inválido", { ...shared, units: ["x"] }, "invalid_units"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    expect(await createStock(input, WORKSPACE_ID, deps)).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que não é do workspace", async () => {
    const deps = makeDeps({ exist: false });

    expect(await createStock(shared, WORKSPACE_ID, deps)).toEqual({ ok: false, error: "invalid_units" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que deixaria produtos para trás no estoque de onde sai", async () => {
    const deps = makeDeps({ leavingWithStock: true });

    expect(await createStock(shared, WORKSPACE_ID, deps)).toEqual({ ok: false, error: "unit_stock_not_empty" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateStock", () => {
  it("grava nome e unidades; o modo não muda na edição", async () => {
    const deps = makeDeps();

    const result = await updateStock(
      { ...distributed, name: "Novo nome", units: [UNIT_A, UNIT_B, UNIT_C] },
      WORKSPACE_ID,
      STOCK_ID,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(STOCK_ID, {
      name: "Novo nome",
      units: [{ unitId: UNIT_A }, { unitId: UNIT_B }, { unitId: UNIT_C }],
    });
  });

  it("o próprio estoque não conta como origem na checagem das unidades", async () => {
    const deps = makeDeps();

    await updateStock(shared, WORKSPACE_ID, STOCK_ID, deps);

    expect(deps.unitsLeavingWithStock).toHaveBeenCalledWith([UNIT_A, UNIT_B], STOCK_ID);
  });

  it("confere a quantidade só das unidades que saem do estoque", async () => {
    const deps = makeDeps({ currentUnits: [UNIT_A, UNIT_B, UNIT_C] });

    await updateStock({ ...shared, units: [UNIT_B] }, WORKSPACE_ID, STOCK_ID, deps);

    expect(deps.findUnitIds).toHaveBeenCalledWith(WORKSPACE_ID, STOCK_ID);
    expect(deps.unitsHoldQuantity).toHaveBeenCalledWith(STOCK_ID, [UNIT_A, UNIT_C]);
  });

  it("sem unidades saindo, não confere quantidade", async () => {
    const deps = makeDeps();

    await updateStock(shared, WORKSPACE_ID, STOCK_ID, deps);

    expect(deps.unitsHoldQuantity).not.toHaveBeenCalled();
  });

  it("recusa tirar unidade que ainda tem quantidade no estoque distribuído", async () => {
    const deps = makeDeps({ holdQuantity: true });

    expect(await updateStock({ ...shared, units: [UNIT_A] }, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "removed_unit_has_stock",
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa unidade que deixaria produtos para trás no estoque de onde sai", async () => {
    const deps = makeDeps({ leavingWithStock: true });

    expect(await updateStock(shared, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "unit_stock_not_empty",
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa entrada inválida antes de consultar o banco", async () => {
    const deps = makeDeps();

    expect(await updateStock({ ...shared, units: [] }, WORKSPACE_ID, STOCK_ID, deps)).toEqual({
      ok: false,
      error: "no_units",
    });
    expect(deps.findUnitIds).not.toHaveBeenCalled();
  });

  it.each([
    ["sem workspace", null, STOCK_ID],
    ["sem estoque", WORKSPACE_ID, null],
  ])("%s, devolve não encontrado", async (_label, workspaceId, stockId) => {
    const deps = makeDeps();

    expect(await updateStock(shared, workspaceId, stockId, deps)).toEqual({ ok: false, error: "stock_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("estoque que não é do workspace devolve não encontrado", async () => {
    const deps = makeDeps({ currentUnits: null });

    expect(await updateStock(shared, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: false, error: "stock_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("devolve não encontrado quando a escrita não acha o estoque", async () => {
    const deps = makeDeps();
    deps.update.mockResolvedValue(false);

    expect(await updateStock(shared, WORKSPACE_ID, STOCK_ID, deps)).toEqual({ ok: false, error: "stock_not_found" });
  });
});

describe("deleteStock", () => {
  function makeDeleteDeps({ hasProducts = false, found = true } = {}) {
    return {
      hasProducts: vi.fn().mockResolvedValue(hasProducts),
      remove: vi.fn().mockResolvedValue(found),
    };
  }

  it("exclui o estoque vazio", async () => {
    const deps = makeDeleteDeps();

    expect(await deleteStock(STOCK_ID, deps)).toEqual({ ok: true });
    expect(deps.hasProducts).toHaveBeenCalledWith(STOCK_ID);
    expect(deps.remove).toHaveBeenCalledWith(STOCK_ID);
  });

  it("recusa excluir estoque com produtos", async () => {
    const deps = makeDeleteDeps({ hasProducts: true });

    expect(await deleteStock(STOCK_ID, deps)).toEqual({ ok: false, error: "stock_not_empty" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("sem id, devolve não encontrado", async () => {
    const deps = makeDeleteDeps();

    expect(await deleteStock(null, deps)).toEqual({ ok: false, error: "stock_not_found" });
    expect(deps.hasProducts).not.toHaveBeenCalled();
  });

  it("devolve não encontrado quando a remoção não acha o estoque", async () => {
    const deps = makeDeleteDeps({ found: false });

    expect(await deleteStock(STOCK_ID, deps)).toEqual({ ok: false, error: "stock_not_found" });
  });
});

describe("leavesProductsBehind", () => {
  it.each([
    ["única unidade de um estoque com produtos", { unitCount: 1, productCount: 3, distributed: false, unitQuantity: 0 }, true],
    ["única unidade do estoque distribuído, mesmo sem quantidade", { unitCount: 1, productCount: 3, distributed: true, unitQuantity: 0 }, true],
    ["estoque compartilhado com outras unidades", { unitCount: 2, productCount: 3, distributed: false, unitQuantity: 0 }, false],
    ["estoque distribuído em que ela ainda tem quantidade", { unitCount: 2, productCount: 3, distributed: true, unitQuantity: 1 }, true],
    ["estoque distribuído em que ela não tem quantidade", { unitCount: 2, productCount: 3, distributed: true, unitQuantity: 0 }, false],
    ["estoque sem produtos", { unitCount: 1, productCount: 0, distributed: false, unitQuantity: 0 }, false],
  ])("%s", (_label, origin, expected) => {
    expect(leavesProductsBehind(origin)).toBe(expected);
  });
});
