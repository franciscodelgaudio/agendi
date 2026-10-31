import { describe, it, expect, vi } from "vitest";
import { registerMovement, transferProduct } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/stock-movement";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";
const OTHER_INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60901";
const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60740";

const MANAGER = actorWith("stock.manage");
const MOVER = actorWith("stock.transfer");

describe("registerMovement", () => {
  function makeDeps({ productExists = true, quantity = 10 as number | null } = {}) {
    return {
      productExists: vi.fn().mockResolvedValue(productExists),
      currentQuantity: vi.fn().mockResolvedValue(quantity),
      apply: vi.fn().mockResolvedValue(undefined),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MANAGER };

  it("registra a entrada com a quantidade inteira", async () => {
    const deps = makeDeps();

    const result = await registerMovement(
      { name: "  Compra do fornecedor  ", type: "in", quantity: " 12 ", productId: PRODUCT_ID },
      INVENTORY_ID,
      ctx,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.currentQuantity).toHaveBeenCalledWith(INVENTORY_ID, PRODUCT_ID);
    expect(deps.apply).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      inventoryId: INVENTORY_ID,
      productId: PRODUCT_ID,
      name: "Compra do fornecedor",
      type: "in",
      quantity: 12,
    });
  });

  it("registra a saída que cabe no que há no inventário", async () => {
    const deps = makeDeps({ quantity: 10 });

    const result = await registerMovement({ name: "Uso", type: "out", quantity: "10", productId: PRODUCT_ID }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.apply).toHaveBeenCalledWith(expect.objectContaining({ type: "out", quantity: 10 }));
  });

  it.each([
    ["in", "Entrada"],
    ["out", "Saída"],
  ])("sem nome, o movimento %s se chama %s", async (type, name) => {
    const deps = makeDeps();

    await registerMovement({ name: " ", type, quantity: "1", productId: PRODUCT_ID }, INVENTORY_ID, ctx, deps);

    expect(deps.apply).toHaveBeenCalledWith(expect.objectContaining({ name }));
  });

  it("não deixa a saída passar do que há no inventário", async () => {
    const deps = makeDeps({ quantity: 3 });

    const result = await registerMovement({ name: "Uso", type: "out", quantity: "4", productId: PRODUCT_ID }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "insufficient_stock" });
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["tipo desconhecido", { type: "adjust", quantity: "1", productId: PRODUCT_ID }, "invalid_type"],
    ["quantidade zero", { type: "in", quantity: "0", productId: PRODUCT_ID }, "invalid_quantity"],
    ["quantidade fracionada", { type: "in", quantity: "1.5", productId: PRODUCT_ID }, "invalid_quantity"],
    ["quantidade acima de 1.000.000", { type: "in", quantity: "1000001", productId: PRODUCT_ID }, "invalid_quantity"],
    ["produto ausente", { type: "in", quantity: "1" }, "invalid_input"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81), type: "in", quantity: "1", productId: PRODUCT_ID }, "name_too_long"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await registerMovement(input, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("recusa produto que não é do workspace", async () => {
    const deps = makeDeps({ productExists: false });

    const result = await registerMovement({ type: "in", quantity: "1", productId: PRODUCT_ID }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it.each([
    ["sem inventário", "", makeDeps()],
    ["inventário que não é do workspace", INVENTORY_ID, makeDeps({ quantity: null })],
  ])("%s devolve não encontrado", async (_label, inventoryId, deps) => {
    const result = await registerMovement({ type: "in", quantity: "1", productId: PRODUCT_ID }, inventoryId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "inventory_not_found" });
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o estoque", STAFF, "forbidden"],
  ] as const)("%s, não registra", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await registerMovement(
      { type: "in", quantity: "1", productId: PRODUCT_ID },
      INVENTORY_ID,
      { workspaceId: WORKSPACE_ID, actor },
      deps,
    );

    expect(result).toEqual({ ok: false, error });
    expect(deps.apply).not.toHaveBeenCalled();
  });
});

describe("transferProduct", () => {
  function makeDeps({ productExists = true, quantity = 10 as number | null, targetExists = true } = {}) {
    return {
      productExists: vi.fn().mockResolvedValue(productExists),
      currentQuantity: vi.fn().mockResolvedValue(quantity),
      inventoryExists: vi.fn().mockResolvedValue(targetExists),
      applyTransfer: vi.fn().mockResolvedValue(undefined),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MOVER };
  const input = { productId: PRODUCT_ID, quantity: "4", toInventoryId: OTHER_INVENTORY_ID };

  it("tira do inventário de origem e põe no de destino", async () => {
    const deps = makeDeps();

    const result = await transferProduct(input, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.inventoryExists).toHaveBeenCalledWith(OTHER_INVENTORY_ID);
    expect(deps.applyTransfer).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      fromInventoryId: INVENTORY_ID,
      toInventoryId: OTHER_INVENTORY_ID,
      productId: PRODUCT_ID,
      quantity: 4,
    });
  });

  it("não transfere para o mesmo inventário", async () => {
    const deps = makeDeps();

    const result = await transferProduct({ ...input, toInventoryId: INVENTORY_ID }, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "same_inventory" });
    expect(deps.applyTransfer).not.toHaveBeenCalled();
  });

  it("não transfere mais do que há na origem", async () => {
    const deps = makeDeps({ quantity: 3 });

    const result = await transferProduct(input, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "insufficient_stock" });
    expect(deps.applyTransfer).not.toHaveBeenCalled();
  });

  it.each([
    ["destino que não é do workspace", makeDeps({ targetExists: false }), "inventory_not_found"],
    ["origem que não é do workspace", makeDeps({ quantity: null }), "inventory_not_found"],
    ["produto que não é do workspace", makeDeps({ productExists: false }), "product_not_found"],
  ])("recusa %s", async (_label, deps, error) => {
    const result = await transferProduct(input, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.applyTransfer).not.toHaveBeenCalled();
  });

  it.each([
    ["quantidade inválida", { ...input, quantity: "-1" }, "invalid_quantity"],
    ["destino ausente", { ...input, toInventoryId: undefined }, "invalid_input"],
  ])("recusa %s", async (_label, value, error) => {
    const deps = makeDeps();

    const result = await transferProduct(value, INVENTORY_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
  });

  it("transferir exige a permissão de transferir; só gerenciar o estoque não basta", async () => {
    expect(await transferProduct(input, INVENTORY_ID, { workspaceId: WORKSPACE_ID, actor: ADMIN }, makeDeps())).toEqual({ ok: true });
    expect(await transferProduct(input, INVENTORY_ID, { workspaceId: WORKSPACE_ID, actor: MANAGER }, makeDeps())).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
