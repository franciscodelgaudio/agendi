import { describe, it, expect, vi } from "vitest";
import { distributeStock, setUnitQuantity, transferProduct } from "@/lib/stock-movement";

const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60800";
const PRODUCT_2 = "64b7f0c2a1b2c3d4e5f60801";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";
const UNIT_C = "64b7f0c2a1b2c3d4e5f60722";

describe("setUnitQuantity", () => {
  const product = {
    quantity: 10,
    unitQuantities: [
      { unitId: UNIT_A, quantity: 6 },
      { unitId: UNIT_B, quantity: 4 },
    ],
  };

  it("troca a parte da unidade e recalcula o total", () => {
    expect(setUnitQuantity(product, UNIT_A, 9)).toEqual({
      quantity: 13,
      previousQuantity: 6,
      unitQuantities: [
        { unitId: UNIT_A, quantity: 9 },
        { unitId: UNIT_B, quantity: 4 },
      ],
    });
  });

  it("diminuir a parte da unidade diminui o total", () => {
    expect(setUnitQuantity(product, UNIT_B, 1)).toEqual(
      expect.objectContaining({ quantity: 7, previousQuantity: 4 }),
    );
  });

  it("unidade que entrou depois no estoque ganha a sua parte, partindo de zero", () => {
    expect(setUnitQuantity(product, UNIT_C, 2)).toEqual({
      quantity: 12,
      previousQuantity: 0,
      unitQuantities: [
        { unitId: UNIT_A, quantity: 6 },
        { unitId: UNIT_B, quantity: 4 },
        { unitId: UNIT_C, quantity: 2 },
      ],
    });
  });

  it("não altera o produto recebido", () => {
    setUnitQuantity(product, UNIT_A, 0);

    expect(product.unitQuantities[0]).toEqual({ unitId: UNIT_A, quantity: 6 });
  });
});

describe("transferProduct", () => {
  // Como chega do FormData.
  const input = { fromUnitId: UNIT_A, toUnitId: UNIT_B, quantity: "3" };

  function makeTransfer(outcome = "transferred") {
    return vi.fn().mockResolvedValue(outcome);
  }

  it("transfere a quantidade da unidade de origem para a de destino", async () => {
    const transfer = makeTransfer();

    expect(await transferProduct(input, PRODUCT_ID, transfer)).toEqual({ ok: true });
    expect(transfer).toHaveBeenCalledWith(PRODUCT_ID, { fromUnitId: UNIT_A, toUnitId: UNIT_B, quantity: 3 });
  });

  it("aceita a quantidade com espaços nas pontas", async () => {
    const transfer = makeTransfer();

    await transferProduct({ ...input, quantity: " 3 " }, PRODUCT_ID, transfer);

    expect(transfer).toHaveBeenCalledWith(PRODUCT_ID, expect.objectContaining({ quantity: 3 }));
  });

  it("sem produto, devolve não encontrado", async () => {
    const transfer = makeTransfer();

    expect(await transferProduct(input, null, transfer)).toEqual({ ok: false, error: "product_not_found" });
    expect(transfer).not.toHaveBeenCalled();
  });

  it.each([
    ["entrada que não é objeto", null, "invalid_input"],
    ["origem que não é texto", { ...input, fromUnitId: 1 }, "invalid_input"],
    ["quantidade que não é texto", { ...input, quantity: 3 }, "invalid_input"],
    ["id de origem inválido", { ...input, fromUnitId: "x" }, "invalid_units"],
    ["id de destino inválido", { ...input, toUnitId: "x" }, "invalid_units"],
    ["origem igual ao destino", { ...input, toUnitId: UNIT_A }, "same_unit"],
    ["quantidade zero", { ...input, quantity: "0" }, "invalid_quantity"],
    ["quantidade negativa", { ...input, quantity: "-1" }, "invalid_quantity"],
    ["quantidade fracionada", { ...input, quantity: "1.5" }, "invalid_quantity"],
    ["quantidade vazia", { ...input, quantity: " " }, "invalid_quantity"],
    ["quantidade acima de 1.000.000", { ...input, quantity: "1000001" }, "invalid_quantity"],
  ])("recusa %s", async (_label, transferInput, error) => {
    const transfer = makeTransfer();

    expect(await transferProduct(transferInput, PRODUCT_ID, transfer)).toEqual({ ok: false, error });
    expect(transfer).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "product_not_found"],
    ["not_distributed", "not_distributed"],
    ["invalid_units", "invalid_units"],
    ["insufficient_stock", "insufficient_stock"],
  ])("repassa o resultado %s da escrita", async (outcome, error) => {
    expect(await transferProduct(input, PRODUCT_ID, makeTransfer(outcome))).toEqual({ ok: false, error });
  });
});

describe("distributeStock", () => {
  const stock = {
    unitIds: [UNIT_A, UNIT_B, UNIT_C],
    products: [
      { productId: PRODUCT_ID, quantity: 10 },
      { productId: PRODUCT_2, quantity: 5 },
    ],
  };

  // Como chega do FormData: a unidade que fica com o resto e o quanto de cada produto
  // está em cada unidade (vazio vira zero).
  const input = {
    defaultUnitId: UNIT_A,
    products: [
      {
        productId: PRODUCT_ID,
        units: [
          { unitId: UNIT_B, quantity: "3" },
          { unitId: UNIT_C, quantity: "2" },
        ],
      },
    ],
  };

  it("dá a cada unidade a sua parte e o resto à unidade padrão, com todas as unidades em cada produto", () => {
    expect(distributeStock(input, stock)).toEqual({
      ok: true,
      products: [
        {
          productId: PRODUCT_ID,
          unitQuantities: [
            { unitId: UNIT_A, quantity: 5 },
            { unitId: UNIT_B, quantity: 3 },
            { unitId: UNIT_C, quantity: 2 },
          ],
        },
        {
          productId: PRODUCT_2,
          unitQuantities: [
            { unitId: UNIT_A, quantity: 5 },
            { unitId: UNIT_B, quantity: 0 },
            { unitId: UNIT_C, quantity: 0 },
          ],
        },
      ],
    });
  });

  it("a quantidade informada para a unidade padrão soma com o resto", () => {
    const result = distributeStock(
      {
        defaultUnitId: UNIT_A,
        products: [
          {
            productId: PRODUCT_ID,
            units: [
              { unitId: UNIT_A, quantity: "1" },
              { unitId: UNIT_B, quantity: "3" },
            ],
          },
        ],
      },
      stock,
    );

    expect(result).toEqual(
      expect.objectContaining({
        products: expect.arrayContaining([
          {
            productId: PRODUCT_ID,
            unitQuantities: [
              { unitId: UNIT_A, quantity: 7 },
              { unitId: UNIT_B, quantity: 3 },
              { unitId: UNIT_C, quantity: 0 },
            ],
          },
        ]),
      }),
    );
  });

  it("quantidade vazia vira zero", () => {
    const result = distributeStock(
      { defaultUnitId: UNIT_A, products: [{ productId: PRODUCT_ID, units: [{ unitId: UNIT_B, quantity: " " }] }] },
      stock,
    );

    expect(result).toEqual(
      expect.objectContaining({
        products: expect.arrayContaining([
          {
            productId: PRODUCT_ID,
            unitQuantities: [
              { unitId: UNIT_A, quantity: 10 },
              { unitId: UNIT_B, quantity: 0 },
              { unitId: UNIT_C, quantity: 0 },
            ],
          },
        ]),
      }),
    );
  });

  it("aceita distribuir exatamente o total", () => {
    const result = distributeStock(
      { defaultUnitId: UNIT_A, products: [{ productId: PRODUCT_2, units: [{ unitId: UNIT_C, quantity: "5" }] }] },
      stock,
    );

    expect(result.ok).toBe(true);
  });

  it("estoque sem produtos não tem nada a distribuir", () => {
    expect(distributeStock({ defaultUnitId: UNIT_A, products: [] }, { unitIds: [UNIT_A], products: [] })).toEqual({
      ok: true,
      products: [],
    });
  });

  it.each([
    ["entrada que não é objeto", null, "invalid_input"],
    ["produtos que não são lista", { ...input, products: "x" }, "invalid_input"],
    ["unidades do produto que não são lista", { ...input, products: [{ productId: PRODUCT_ID, units: "x" }] }, "invalid_input"],
    ["produto que não é do estoque", { ...input, products: [{ productId: "64b7f0c2a1b2c3d4e5f60899", units: [] }] }, "invalid_input"],
    [
      "produto repetido",
      { ...input, products: [{ productId: PRODUCT_ID, units: [] }, { productId: PRODUCT_ID, units: [] }] },
      "invalid_input",
    ],
    ["unidade padrão que não é do estoque", { ...input, defaultUnitId: "64b7f0c2a1b2c3d4e5f60799" }, "invalid_units"],
    [
      "unidade que não é do estoque",
      { ...input, products: [{ productId: PRODUCT_ID, units: [{ unitId: "64b7f0c2a1b2c3d4e5f60799", quantity: "1" }] }] },
      "invalid_units",
    ],
    [
      "unidade repetida no produto",
      {
        ...input,
        products: [
          {
            productId: PRODUCT_ID,
            units: [
              { unitId: UNIT_B, quantity: "1" },
              { unitId: UNIT_B, quantity: "1" },
            ],
          },
        ],
      },
      "invalid_input",
    ],
    [
      "quantidade inválida",
      { ...input, products: [{ productId: PRODUCT_ID, units: [{ unitId: UNIT_B, quantity: "-1" }] }] },
      "invalid_quantity",
    ],
    [
      "quantidade que não é texto",
      { ...input, products: [{ productId: PRODUCT_ID, units: [{ unitId: UNIT_B, quantity: 1 }] }] },
      "invalid_input",
    ],
    [
      "distribuição maior que a quantidade do produto",
      {
        ...input,
        products: [
          {
            productId: PRODUCT_ID,
            units: [
              { unitId: UNIT_B, quantity: "6" },
              { unitId: UNIT_C, quantity: "5" },
            ],
          },
        ],
      },
      "distribution_exceeds_quantity",
    ],
  ])("recusa %s", (_label, distributeInput, error) => {
    expect(distributeStock(distributeInput, stock)).toEqual({ ok: false, error });
  });
});
