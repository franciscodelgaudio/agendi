import { describe, it, expect, vi } from "vitest";
import { resolveProducts } from "@/service/workspace/[workspaceId]/stock/products/product-selection";

const OIL_ID = "64b7f0c2a1b2c3d4e5f60761";
const TOWEL_ID = "64b7f0c2a1b2c3d4e5f60762";
const OTHER_UNIT_ID = "64b7f0c2a1b2c3d4e5f60769";

const PRODUCTS = [
  { id: OIL_ID, name: "Óleo de amêndoas" },
  { id: TOWEL_ID, name: "Toalha" },
];

// Devolve só os produtos que existem na unidade.
function makeFind(products = PRODUCTS) {
  return vi.fn(async (ids: string[]) => products.filter((p) => ids.includes(p.id)));
}

describe("resolveProducts", () => {
  it("copia o nome de cada produto, mantendo a ordem escolhida", async () => {
    const result = await resolveProducts([TOWEL_ID, OIL_ID], makeFind());

    expect(result).toEqual({
      ok: true,
      products: [
        { productId: TOWEL_ID, productName: "Toalha" },
        { productId: OIL_ID, productName: "Óleo de amêndoas" },
      ],
    });
  });

  it.each([
    ["ausente", undefined],
    ["null", null],
    ["lista vazia", []],
  ])("devolve lista vazia sem buscar quando a seleção é %s", async (_label, productIds) => {
    const find = makeFind();

    const result = await resolveProducts(productIds, find);

    expect(result).toEqual({ ok: true, products: [] });
    expect(find).not.toHaveBeenCalled();
  });

  it("remove espaços, ignora ids vazios e repetidos, buscando cada id uma vez só", async () => {
    const find = makeFind();

    const result = await resolveProducts([` ${OIL_ID} `, "", OIL_ID, "  ", TOWEL_ID], find);

    expect(result).toEqual({
      ok: true,
      products: [
        { productId: OIL_ID, productName: "Óleo de amêndoas" },
        { productId: TOWEL_ID, productName: "Toalha" },
      ],
    });
    expect(find).toHaveBeenCalledWith([OIL_ID, TOWEL_ID]);
  });

  it("aceita até 20 produtos distintos", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, name: `Produto ${i}` }));

    const result = await resolveProducts(
      many.map((p) => p.id),
      makeFind(many),
    );

    expect(result.ok && result.products).toHaveLength(20);
  });

  it("retorna too_many_products sem buscar quando há mais de 20 produtos distintos", async () => {
    const find = makeFind();

    const result = await resolveProducts(
      Array.from({ length: 21 }, (_, i) => `id-${i}`),
      find,
    );

    expect(result).toEqual({ ok: false, error: "too_many_products" });
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    ["não é lista", OIL_ID],
    ["lista com item que não é string", [OIL_ID, 123]],
  ])("retorna invalid_input quando a seleção %s", async (_label, productIds) => {
    const result = await resolveProducts(productIds, makeFind());

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retorna product_not_found quando algum produto não é da unidade", async () => {
    const result = await resolveProducts([OIL_ID, OTHER_UNIT_ID], makeFind());

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });
});
