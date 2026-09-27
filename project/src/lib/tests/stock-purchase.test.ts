import { describe, it, expect, vi } from "vitest";
import { recordStockPurchase, stockPurchaseExpense, SUPPLIES_GROUP_NAME } from "@/lib/stock-purchase";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60761";
const GROUP_ID = "64b7f0c2a1b2c3d4e5f60740";
// 24/09/2026 às 23:30 em Brasília (já é dia 25 em UTC).
const NOW = new Date("2026-09-25T02:30:00.000Z");

describe("stockPurchaseExpense", () => {
  it("produto novo: a quantidade inteira foi comprada pelo preço de custo", () => {
    expect(
      stockPurchaseExpense({ productName: "Óleo de amêndoas", previousQuantity: 0, quantity: 10, costCents: 4_590 }),
    ).toEqual({ description: "Compra de Óleo de amêndoas (10 un.)", amountCents: 45_900 });
  });

  it("quantidade aumentada: só o que entrou foi comprado", () => {
    expect(stockPurchaseExpense({ productName: "Toalha", previousQuantity: 10, quantity: 13, costCents: 2_000 })).toEqual({
      description: "Compra de Toalha (3 un.)",
      amountCents: 6_000,
    });
  });

  it("uma unidade comprada", () => {
    expect(stockPurchaseExpense({ productName: "Vela", previousQuantity: 2, quantity: 3, costCents: 1_500 })).toEqual({
      description: "Compra de Vela (1 un.)",
      amountCents: 1_500,
    });
  });

  it.each([
    ["a quantidade diminui", 10, 8, 2_000],
    ["a quantidade não muda", 10, 10, 2_000],
    ["o produto é cadastrado sem estoque", 0, 0, 2_000],
    ["o preço de custo é zero", 0, 10, 0],
  ])("sem despesa quando %s", (_label, previousQuantity, quantity, costCents) => {
    expect(stockPurchaseExpense({ productName: "Toalha", previousQuantity, quantity, costCents })).toBeNull();
  });

  it("corta a descrição em 80 caracteres para ela continuar editável", () => {
    const result = stockPurchaseExpense({
      productName: "a".repeat(80),
      previousQuantity: 0,
      quantity: 5,
      costCents: 100,
    });

    expect(result!.description).toHaveLength(80);
    expect(result!.description.startsWith("Compra de aaa")).toBe(true);
  });
});

describe("recordStockPurchase", () => {
  function makeDeps() {
    return {
      ensureGroup: vi.fn().mockResolvedValue(GROUP_ID),
      insert: vi.fn().mockResolvedValue(undefined),
      now: NOW,
    };
  }

  const purchase = { unitId: UNIT_ID, productId: PRODUCT_ID, productName: "Toalha", costCents: 2_000 };

  it("lança a compra como despesa paga hoje (em Brasília) no grupo de insumos", async () => {
    const deps = makeDeps();

    await recordStockPurchase({ ...purchase, previousQuantity: 4, quantity: 6 }, deps);

    expect(deps.ensureGroup).toHaveBeenCalledWith(UNIT_ID, SUPPLIES_GROUP_NAME);
    expect(deps.insert).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      groupId: GROUP_ID,
      description: "Compra de Toalha (2 un.)",
      amountCents: 4_000,
      date: "2026-09-24",
      paidAt: NOW,
      series: null,
      productId: PRODUCT_ID,
    });
  });

  it("o grupo de insumos se chama Insumos", () => {
    expect(SUPPLIES_GROUP_NAME).toBe("Insumos");
  });

  it("sem compra, não cria grupo nem despesa", async () => {
    const deps = makeDeps();

    await recordStockPurchase({ ...purchase, previousQuantity: 6, quantity: 4 }, deps);

    expect(deps.ensureGroup).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });
});
