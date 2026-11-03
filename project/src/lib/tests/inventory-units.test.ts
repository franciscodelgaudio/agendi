import { describe, it, expect, vi } from "vitest";
import { setInventoryUnits } from "@/service/workspace/[workspaceId]/stock/inventory-units";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";

const MANAGER = actorWith("units.manage");
const STOCK_MANAGER = actorWith("stock.manage");

function makeDeps({ unitsExist = true, found = true } = {}) {
  return {
    unitsExist: vi.fn().mockResolvedValue(unitsExist),
    update: vi.fn().mockResolvedValue(found),
  };
}

const ctx = { actor: ADMIN };

describe("setInventoryUnits", () => {
  it("vincula o estoque às unidades escolhidas", async () => {
    const deps = makeDeps();

    const result = await setInventoryUnits({ unitIds: [UNIT_A, UNIT_B] }, INVENTORY_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.unitsExist).toHaveBeenCalledWith([UNIT_A, UNIT_B]);
    expect(deps.update).toHaveBeenCalledWith(INVENTORY_ID, [UNIT_A, UNIT_B]);
  });

  it("sem nenhuma unidade escolhida, desvincula todas sem consultar unidades", async () => {
    const deps = makeDeps();

    const result = await setInventoryUnits({ unitIds: [] }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.unitsExist).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(INVENTORY_ID, []);
  });

  it("ignora unidades repetidas", async () => {
    const deps = makeDeps();

    await setInventoryUnits({ unitIds: [UNIT_A, UNIT_B, UNIT_A] }, INVENTORY_ID, ctx, deps);

    expect(deps.unitsExist).toHaveBeenCalledWith([UNIT_A, UNIT_B]);
    expect(deps.update).toHaveBeenCalledWith(INVENTORY_ID, [UNIT_A, UNIT_B]);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["lista ausente", {}, "invalid_input"],
    ["lista que não é array", { unitIds: UNIT_A }, "invalid_input"],
    ["mais de 200 unidades", { unitIds: Array.from({ length: 201 }, () => UNIT_A) }, "invalid_input"],
    ["unidade que não é string", { unitIds: [1] }, "invalid_unit"],
    ["unidade que não é ObjectId", { unitIds: [UNIT_A, "centro"] }, "invalid_unit"],
  ])("recusa %s sem salvar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await setInventoryUnits(input, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.unitsExist).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa unidade que não é do workspace", async () => {
    const deps = makeDeps({ unitsExist: false });

    const result = await setInventoryUnits({ unitIds: [UNIT_A] }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_unit" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna inventory_not_found sem salvar quando não há inventoryId (%j)", async (inventoryId) => {
    const deps = makeDeps();

    const result = await setInventoryUnits({ unitIds: [UNIT_A] }, inventoryId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "inventory_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna inventory_not_found quando o estoque não existe (ou não é do workspace)", async () => {
    const result = await setInventoryUnits({ unitIds: [UNIT_A] }, INVENTORY_ID, ctx, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "inventory_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem nenhuma permissão", STAFF, "forbidden"],
    ["só com a permissão de gerenciar estoque", STOCK_MANAGER, "forbidden"],
  ] as const)("%s, não salva", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await setInventoryUnits({ unitIds: [UNIT_A] }, INVENTORY_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.unitsExist).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});
