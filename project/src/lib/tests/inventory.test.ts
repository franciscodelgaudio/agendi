import { describe, it, expect, vi } from "vitest";
import { createInventory, deleteInventory, updateInventory } from "@/service/workspace/[workspaceId]/stock/inventory";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";

const MANAGER = actorWith("stock.manage");

describe("createInventory", () => {
  function makeDeps() {
    return { insert: vi.fn().mockResolvedValue({ id: INVENTORY_ID }) };
  }

  it("cria o inventário vazio no workspace", async () => {
    const deps = makeDeps();

    const result = await createInventory({ name: "  Depósito Central  " }, { workspaceId: WORKSPACE_ID, actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true, inventoryId: INVENTORY_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, name: "Depósito Central" });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", {}, "invalid_input"],
    ["nome vazio", { name: " " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { name: "a".repeat(41) }, "name_too_long"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createInventory(input, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o estoque", STAFF, "forbidden"],
  ] as const)("%s, não cria", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createInventory({ name: "Depósito" }, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateInventory", () => {
  function makeDeps(found = true) {
    return { update: vi.fn().mockResolvedValue(found) };
  }

  it("renomeia o inventário", async () => {
    const deps = makeDeps();

    const result = await updateInventory({ name: "Depósito" }, INVENTORY_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(INVENTORY_ID, { name: "Depósito" });
  });

  it.each([
    ["sem id", null, makeDeps()],
    ["inventário que não é do workspace", INVENTORY_ID, makeDeps(false)],
  ])("%s devolve não encontrado", async (_label, inventoryId, deps) => {
    const result = await updateInventory({ name: "Depósito" }, inventoryId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "inventory_not_found" });
  });

  it("sem a permissão de gerenciar o estoque, não renomeia", async () => {
    const deps = makeDeps();

    const result = await updateInventory({ name: "Depósito" }, INVENTORY_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteInventory", () => {
  function makeDeps({ hasUnits = false, found = true } = {}) {
    return {
      hasUnits: vi.fn().mockResolvedValue(hasUnits),
      remove: vi.fn().mockResolvedValue(found),
    };
  }

  it("exclui o inventário que nenhuma unidade usa", async () => {
    const deps = makeDeps();

    const result = await deleteInventory(INVENTORY_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(INVENTORY_ID);
  });

  it("não exclui o inventário que alguma unidade usa", async () => {
    const deps = makeDeps({ hasUnits: true });

    const result = await deleteInventory(INVENTORY_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "inventory_in_use" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["inventário que não é do workspace", INVENTORY_ID, makeDeps({ found: false })],
  ])("%s devolve não encontrado", async (_label, inventoryId, deps) => {
    const result = await deleteInventory(inventoryId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "inventory_not_found" });
  });

  it("sem a permissão de gerenciar o estoque, não exclui", async () => {
    const deps = makeDeps();

    const result = await deleteInventory(INVENTORY_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
