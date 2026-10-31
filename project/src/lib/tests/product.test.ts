import { describe, it, expect, vi } from "vitest";
import { createProduct, deleteProduct, updateProduct } from "@/service/workspace/[workspaceId]/stock/products/product";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60740";

const MANAGER = actorWith("stock.manage");

describe("createProduct", () => {
  function makeDeps() {
    return { insert: vi.fn().mockResolvedValue({ id: PRODUCT_ID }) };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MANAGER };

  it("cadastra o produto no catálogo do workspace com o preço em centavos", async () => {
    const deps = makeDeps();

    const result = await createProduct({ name: "  Óleo de amêndoas  ", price: "45,90" }, ctx, deps);

    expect(result).toEqual({ ok: true, productId: PRODUCT_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, name: "Óleo de amêndoas", priceCents: 4_590 });
  });

  it("aceita preço zero", async () => {
    const deps = makeDeps();

    await createProduct({ name: "Toalha", price: "0" }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ priceCents: 0 }));
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["preço ausente", { name: "Óleo" }, "invalid_input"],
    ["nome vazio", { name: " ", price: "1" }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81), price: "1" }, "name_too_long"],
    ["preço inválido", { name: "Óleo", price: "abc" }, "invalid_price"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createProduct(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o estoque", STAFF, "forbidden"],
  ] as const)("%s, não cadastra", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createProduct({ name: "Óleo", price: "1" }, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateProduct", () => {
  function makeDeps(found = true) {
    return { update: vi.fn().mockResolvedValue(found) };
  }

  it("grava nome e preço", async () => {
    const deps = makeDeps();

    const result = await updateProduct({ name: "Óleo", price: "50" }, PRODUCT_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(PRODUCT_ID, { name: "Óleo", priceCents: 5_000 });
  });

  it.each([
    ["sem id", null, makeDeps()],
    ["produto que não é do workspace", PRODUCT_ID, makeDeps(false)],
  ])("%s devolve não encontrado", async (_label, productId, deps) => {
    const result = await updateProduct({ name: "Óleo", price: "50" }, productId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("sem a permissão de gerenciar o estoque, não edita", async () => {
    const deps = makeDeps();

    const result = await updateProduct({ name: "Óleo", price: "50" }, PRODUCT_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteProduct", () => {
  function makeDeps({ inStock = false, found = true } = {}) {
    return {
      inStock: vi.fn().mockResolvedValue(inStock),
      remove: vi.fn().mockResolvedValue(found),
    };
  }

  it("exclui o produto que não está em nenhum inventário", async () => {
    const deps = makeDeps();

    const result = await deleteProduct(PRODUCT_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it("não exclui o produto que ainda tem quantidade em algum inventário", async () => {
    const deps = makeDeps({ inStock: true });

    const result = await deleteProduct(PRODUCT_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "product_in_stock" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["produto que não é do workspace", PRODUCT_ID, makeDeps({ found: false })],
  ])("%s devolve não encontrado", async (_label, productId, deps) => {
    const result = await deleteProduct(productId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("sem a permissão de gerenciar o estoque, não exclui", async () => {
    const deps = makeDeps();

    const result = await deleteProduct(PRODUCT_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
