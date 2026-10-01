import { describe, it, expect, vi } from "vitest";
import { transferProduct } from "@/service/workspace/[workspaceId]/stock/stock-movement";

const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60800";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";

// Leva produto do estoque de uma unidade para o de outra. Unidades no mesmo estoque
// compartilhado (same_stock) não têm o que transferir.
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
    ["invalid_units", "invalid_units"],
    ["same_stock", "same_stock"],
    ["insufficient_stock", "insufficient_stock"],
  ])("repassa o resultado %s da escrita", async (outcome, error) => {
    expect(await transferProduct(input, PRODUCT_ID, makeTransfer(outcome))).toEqual({ ok: false, error });
  });
});
