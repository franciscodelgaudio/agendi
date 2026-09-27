import { describe, it, expect } from "vitest";
import { mergeCashFlowSummaries, mergeGroupsByName, sumBalances } from "@/lib/cash-flow-overview";
import type { ExpenseCashFlowAmounts } from "@/lib/cash-flow";

const WEEK_1 = { from: "2026-09-01", to: "2026-09-06" };
const WEEK_2 = { from: "2026-09-07", to: "2026-09-13" };

const amounts = (grossCents: number, extra: Partial<ExpenseCashFlowAmounts> = {}): ExpenseCashFlowAmounts => {
  const base = { grossCents, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, expenseCents: 0, ...extra };
  return {
    ...base,
    netCents: base.grossCents - base.partnerShareCents - base.commissionCents - base.salaryCents - base.expenseCents,
  };
};
const ZERO = amounts(0);

describe("mergeCashFlowSummaries", () => {
  it("soma cada intervalo e os totais de todas as unidades, real e previsto separados", () => {
    const a = {
      buckets: [
        { ...WEEK_1, real: amounts(1_000, { partnerShareCents: 100 }), forecast: amounts(1_500, { partnerShareCents: 150 }) },
        { ...WEEK_2, real: amounts(0), forecast: amounts(200) },
      ],
      total: { real: amounts(1_000, { partnerShareCents: 100 }), forecast: amounts(1_700, { partnerShareCents: 150 }) },
    };
    const b = {
      buckets: [
        { ...WEEK_1, real: amounts(500, { commissionCents: 50, salaryCents: 30 }), forecast: amounts(500, { expenseCents: 80 }) },
        { ...WEEK_2, real: amounts(300, { expenseCents: 20 }), forecast: amounts(300, { expenseCents: 20 }) },
      ],
      total: {
        real: amounts(800, { commissionCents: 50, salaryCents: 30, expenseCents: 20 }),
        forecast: amounts(800, { expenseCents: 100 }),
      },
    };

    expect(mergeCashFlowSummaries([WEEK_1, WEEK_2], [a, b])).toEqual({
      buckets: [
        {
          ...WEEK_1,
          real: amounts(1_500, { partnerShareCents: 100, commissionCents: 50, salaryCents: 30 }),
          forecast: amounts(2_000, { partnerShareCents: 150, expenseCents: 80 }),
        },
        { ...WEEK_2, real: amounts(300, { expenseCents: 20 }), forecast: amounts(500, { expenseCents: 20 }) },
      ],
      total: {
        real: amounts(1_800, { partnerShareCents: 100, commissionCents: 50, salaryCents: 30, expenseCents: 20 }),
        forecast: amounts(2_500, { partnerShareCents: 150, expenseCents: 100 }),
      },
    });
  });

  it("sem unidades, os intervalos e o total ficam zerados", () => {
    expect(mergeCashFlowSummaries([WEEK_1, WEEK_2], [])).toEqual({
      buckets: [
        { ...WEEK_1, real: ZERO, forecast: ZERO },
        { ...WEEK_2, real: ZERO, forecast: ZERO },
      ],
      total: { real: ZERO, forecast: ZERO },
    });
  });
});

describe("mergeGroupsByName", () => {
  it("junta os grupos de mesmo nome somando o pago, com id e ícone do primeiro, na ordem em que aparecem", () => {
    const groups = [
      { id: "a1", name: "Aluguel", icon: "casa", paidCents: 1_000 },
      { id: "a2", name: "Insumos", icon: null, paidCents: 200 },
      { id: "b1", name: "Aluguel", icon: "prédio", paidCents: 500 },
      { id: "b2", name: "Marketing", icon: null, paidCents: 0 },
    ];

    expect(mergeGroupsByName(groups)).toEqual([
      { id: "a1", name: "Aluguel", icon: "casa", paidCents: 1_500 },
      { id: "a2", name: "Insumos", icon: null, paidCents: 200 },
      { id: "b2", name: "Marketing", icon: null, paidCents: 0 },
    ]);
  });

  it("ignora maiúsculas e espaços nas pontas ao comparar os nomes", () => {
    expect(
      mergeGroupsByName([
        { id: "a", name: "Aluguel", paidCents: 100 },
        { id: "b", name: " aluguel ", paidCents: 50 },
      ]),
    ).toEqual([{ id: "a", name: "Aluguel", paidCents: 150 }]);
  });

  it("não altera os grupos recebidos", () => {
    const groups = [
      { id: "a", name: "Aluguel", paidCents: 100 },
      { id: "b", name: "Aluguel", paidCents: 50 },
    ];
    mergeGroupsByName(groups);
    expect(groups[0].paidCents).toBe(100);
  });
});

describe("sumBalances", () => {
  it("soma os saldos das unidades que têm saldo inicial", () => {
    expect(sumBalances([1_000, null, -300])).toBe(700);
  });

  it("sem nenhuma unidade com saldo inicial, fica sem saldo", () => {
    expect(sumBalances([null, null])).toBeNull();
    expect(sumBalances([])).toBeNull();
  });
});
