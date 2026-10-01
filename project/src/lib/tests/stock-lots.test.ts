import { describe, it, expect } from "vitest";
import { addLots, consumeLots, summarizeLots } from "@/service/workspace/[workspaceId]/stock/stock-lots";

const day = (d: number) => new Date(Date.UTC(2026, 8, d));

// Lotes de um item de estoque: cada compra com a quantidade que ainda resta e o preço pago.
const first = { quantity: 5, unitCostCents: 2000, purchasedAt: day(1) };
const second = { quantity: 5, unitCostCents: 3000, purchasedAt: day(10) };

// PEPS: o que entrou primeiro sai primeiro.
describe("consumeLots", () => {
  it("tira do lote mais antigo e devolve o custo do que saiu", () => {
    expect(consumeLots([first, second], 3)).toEqual({
      ok: true,
      lots: [{ ...first, quantity: 2 }, second],
      consumed: [{ ...first, quantity: 3 }],
      costCents: 6000,
    });
  });

  it("passa para o lote seguinte quando o mais antigo acaba, e o lote vazio sai", () => {
    expect(consumeLots([first, second], 7)).toEqual({
      ok: true,
      lots: [{ ...second, quantity: 3 }],
      consumed: [first, { ...second, quantity: 2 }],
      costCents: 5 * 2000 + 2 * 3000,
    });
  });

  it("consome tudo", () => {
    expect(consumeLots([first, second], 10)).toEqual({
      ok: true,
      lots: [],
      consumed: [first, second],
      costCents: 25000,
    });
  });

  it("segue a data da compra mesmo com os lotes fora de ordem", () => {
    const result = consumeLots([second, first], 1);

    expect(result).toEqual(
      expect.objectContaining({ consumed: [{ ...first, quantity: 1 }], lots: [{ ...first, quantity: 4 }, second] }),
    );
  });

  it("zero não tira nada", () => {
    expect(consumeLots([first], 0)).toEqual({ ok: true, lots: [first], consumed: [], costCents: 0 });
  });

  it("recusa tirar mais do que há", () => {
    expect(consumeLots([first, second], 11)).toEqual({ ok: false, error: "insufficient_stock" });
    expect(consumeLots([], 1)).toEqual({ ok: false, error: "insufficient_stock" });
  });

  it("não altera os lotes recebidos", () => {
    const lots = [{ ...first }, { ...second }];

    consumeLots(lots, 7);

    expect(lots).toEqual([first, second]);
  });
});

// Lotes que entram (compra, transferência, estoques que se juntam), na ordem da data da compra.
describe("addLots", () => {
  it("põe os lotes em ordem de compra", () => {
    const middle = { quantity: 2, unitCostCents: 2500, purchasedAt: day(5) };

    expect(addLots([first, second], [middle])).toEqual([first, middle, second]);
  });

  it("na mesma data, o que já estava vem antes", () => {
    const sameDay = { quantity: 1, unitCostCents: 9900, purchasedAt: day(1) };

    expect(addLots([first], [sameDay])).toEqual([first, sameDay]);
  });

  it("ignora lote sem quantidade", () => {
    expect(addLots([first], [{ ...second, quantity: 0 }])).toEqual([first]);
  });

  it("não altera os lotes recebidos", () => {
    const lots = [second];

    addLots(lots, [first]);

    expect(lots).toEqual([second]);
  });
});

describe("summarizeLots", () => {
  it("soma a quantidade e o valor, com o custo do próximo a sair", () => {
    expect(summarizeLots([second, first])).toEqual({ quantity: 10, valueCents: 25000, nextUnitCostCents: 2000 });
  });

  it("sem lotes, não há próximo a sair", () => {
    expect(summarizeLots([])).toEqual({ quantity: 0, valueCents: 0, nextUnitCostCents: null });
  });
});
