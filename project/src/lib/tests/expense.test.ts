import { describe, it, expect, vi } from "vitest";
import {
  createExpense,
  monthlyDates,
  splitInstallments,
  dailyExpenseTotalsPipeline,
  deleteExpense,
  expenseGroupTotalsPipeline,
  setExpensePaid,
  summarizeExpenseGroups,
  expenseBudgetCents,
  updateExpense,
} from "@/lib/expense";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const GROUP_ID = "64b7f0c2a1b2c3d4e5f60740";
const EXPENSE_ID = "64b7f0c2a1b2c3d4e5f60750";
const SERIES_ID = "64b7f0c2a1b2c3d4e5f60790";
const NOW = new Date("2026-09-25T02:30:00.000Z");

// Como chega do FormData: valor do AmountInput, dia do DayField e checkbox "on" quando marcado.
const validInput = { groupId: GROUP_ID, description: "DAS de setembro", amount: "850.40", date: "2026-09-20" };

describe("createExpense", () => {
  function makeDeps({ groupExists = true } = {}) {
    return {
      // Devolve um id por lançamento, na ordem recebida.
      insert: vi.fn(async (entries: unknown[]) => entries.map((_, index) => `${EXPENSE_ID}-${index + 1}`)),
      groupExists: vi.fn().mockResolvedValue(groupExists),
      newSeriesId: () => SERIES_ID,
      now: NOW,
    };
  }

  it("cria a despesa pendente na unidade com o valor em centavos", async () => {
    const deps = makeDeps();

    const result = await createExpense(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, expenseIds: [`${EXPENSE_ID}-1`] });
    expect(deps.groupExists).toHaveBeenCalledWith(UNIT_ID, GROUP_ID);
    expect(deps.insert).toHaveBeenCalledWith([
      {
        unitId: UNIT_ID,
        groupId: GROUP_ID,
        description: "DAS de setembro",
        amountCents: 85_040,
        date: "2026-09-20",
        paidAt: null,
        series: null,
      },
    ]);
  });

  it("marcada como paga, guarda quando foi paga", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, paid: "on" }, UNIT_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith([expect.objectContaining({ paidAt: NOW })]);
  });

  it("remove espaços das pontas da descrição, do valor e do dia", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, description: "  Luz  ", amount: " 10 ", date: " 2026-09-01 " }, UNIT_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith([
      expect.objectContaining({ description: "Luz", amountCents: 1_000, date: "2026-09-01" }),
    ]);
  });

  it("aceita descrição com exatamente 80 caracteres", async () => {
    const deps = makeDeps();

    const result = await createExpense({ ...validInput, description: "a".repeat(80) }, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, expenseIds: [`${EXPENSE_ID}-1`] });
  });

  it.each([
    ["descrição ausente", { ...validInput, description: undefined }, "invalid_input"],
    ["grupo que não é texto", { ...validInput, groupId: 1 }, "invalid_input"],
    ["descrição vazia", { ...validInput, description: "  " }, "invalid_description"],
    ["descrição com mais de 80 caracteres", { ...validInput, description: "a".repeat(81) }, "description_too_long"],
    ["valor inválido", { ...validInput, amount: "abc" }, "invalid_amount"],
    ["valor zerado", { ...validInput, amount: "0.00" }, "invalid_amount"],
    ["dia inválido", { ...validInput, date: "2026-02-30" }, "invalid_date"],
    ["grupo vazio", { ...validInput, groupId: "" }, "group_not_found"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createExpense(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("parcelada divide o valor total em lançamentos mensais da mesma série", async () => {
    const deps = makeDeps();

    const result = await createExpense(
      { ...validInput, amount: "100.00", date: "2026-01-31", repeat: "installments", count: "3" },
      UNIT_ID,
      deps,
    );

    expect(result).toEqual({ ok: true, expenseIds: [1, 2, 3].map((n) => `${EXPENSE_ID}-${n}`) });
    const entry = (number: number, amountCents: number, date: string) => ({
      unitId: UNIT_ID,
      groupId: GROUP_ID,
      description: "DAS de setembro",
      amountCents,
      date,
      paidAt: null,
      series: { id: SERIES_ID, kind: "installments", number, count: 3 },
    });
    expect(deps.insert).toHaveBeenCalledWith([
      entry(1, 3_334, "2026-01-31"),
      entry(2, 3_333, "2026-02-28"),
      entry(3, 3_333, "2026-03-31"),
    ]);
  });

  it("recorrente repete o mesmo valor a cada mês", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, amount: "1200.00", repeat: "recurring", count: "2" }, UNIT_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        amountCents: 120_000,
        date: "2026-09-20",
        series: { id: SERIES_ID, kind: "recurring", number: 1, count: 2 },
      }),
      expect.objectContaining({
        amountCents: 120_000,
        date: "2026-10-20",
        series: { id: SERIES_ID, kind: "recurring", number: 2, count: 2 },
      }),
    ]);
  });

  it("numa série marcada como paga, só o primeiro lançamento fica pago", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, paid: "on", repeat: "recurring", count: "3" }, UNIT_ID, deps);

    const entries = deps.insert.mock.calls[0][0] as { paidAt: Date | null }[];
    expect(entries.map((entry) => entry.paidAt)).toEqual([NOW, null, null]);
  });

  it.each(["none", "", undefined])("repetição %j cria um lançamento só, ignorando a quantidade", async (repeat) => {
    const deps = makeDeps();

    await createExpense({ ...validInput, repeat, count: "5" }, UNIT_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith([expect.objectContaining({ series: null })]);
  });

  it("aceita série com 60 lançamentos", async () => {
    const deps = makeDeps();

    const result = await createExpense({ ...validInput, repeat: "recurring", count: "60" }, UNIT_ID, deps);

    expect(result.ok && result.expenseIds).toHaveLength(60);
  });

  it.each([
    ["repetição desconhecida", { ...validInput, repeat: "weekly", count: "3" }, "invalid_input"],
    ["quantidade que não é texto", { ...validInput, repeat: "recurring", count: 3 }, "invalid_input"],
    ["série de um lançamento só", { ...validInput, repeat: "installments", count: "1" }, "invalid_count"],
    ["série com mais de 60 lançamentos", { ...validInput, repeat: "recurring", count: "61" }, "invalid_count"],
    ["quantidade com fração", { ...validInput, repeat: "recurring", count: "2.5" }, "invalid_count"],
    ["quantidade ausente", { ...validInput, repeat: "installments" }, "invalid_count"],
    ["parcela menor que um centavo", { ...validInput, amount: "0.02", repeat: "installments", count: "3" }, "invalid_amount"],
  ])("retorna erro sem salvar quando a série tem %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createExpense(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("não usa grupo de outra unidade", async () => {
    const deps = makeDeps({ groupExists: false });

    const result = await createExpense(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("unidade não encontrada quando o id é %j", async (unitId) => {
    const deps = makeDeps();

    const result = await createExpense(validInput, unitId, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateExpense", () => {
  function makeDeps({ found = true, groupExists = true } = {}) {
    return {
      update: vi.fn().mockResolvedValue(found),
      groupExists: vi.fn().mockResolvedValue(groupExists),
    };
  }

  it("atualiza grupo, descrição, valor e dia sem mexer no pagamento", async () => {
    const deps = makeDeps();

    const result = await updateExpense({ ...validInput, paid: "on" }, UNIT_ID, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(
      EXPENSE_ID,
      { groupId: GROUP_ID, description: "DAS de setembro", amountCents: 85_040, date: "2026-09-20" },
      "this",
    );
  });

  it("nesta e nas próximas da série, atualiza grupo, descrição e valor, mas não o dia de cada uma", async () => {
    const deps = makeDeps();

    const result = await updateExpense({ ...validInput, scope: "following" }, UNIT_ID, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(
      EXPENSE_ID,
      { groupId: GROUP_ID, description: "DAS de setembro", amountCents: 85_040 },
      "following",
    );
  });

  it.each(["this", "", "all", undefined])("escopo %j altera só esta despesa", async (scope) => {
    const deps = makeDeps();

    await updateExpense({ ...validInput, scope }, UNIT_ID, EXPENSE_ID, deps);

    expect(deps.update).toHaveBeenCalledWith(EXPENSE_ID, expect.objectContaining({ date: "2026-09-20" }), "this");
  });

  it("não salva quando o valor é inválido", async () => {
    const deps = makeDeps();

    const result = await updateExpense({ ...validInput, amount: "1.234" }, UNIT_ID, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não move para grupo de outra unidade", async () => {
    const deps = makeDeps({ groupExists: false });

    const result = await updateExpense(validInput, UNIT_ID, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem unidade", null, EXPENSE_ID],
    ["sem despesa", UNIT_ID, ""],
  ])("despesa não encontrada quando %s", async (_label, unitId, expenseId) => {
    const deps = makeDeps();

    const result = await updateExpense(validInput, unitId, expenseId, deps);

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("despesa não encontrada quando ela não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await updateExpense(validInput, UNIT_ID, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
  });
});

describe("setExpensePaid", () => {
  it("marca como paga agora", async () => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await setExpensePaid(EXPENSE_ID, true, { update, now: NOW });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(EXPENSE_ID, NOW);
  });

  it("desmarcar volta a despesa para pendente", async () => {
    const update = vi.fn().mockResolvedValue(true);

    await setExpensePaid(EXPENSE_ID, false, { update, now: NOW });

    expect(update).toHaveBeenCalledWith(EXPENSE_ID, null);
  });

  it.each([null, undefined, ""])("despesa não encontrada quando o id é %j", async (expenseId) => {
    const update = vi.fn();

    const result = await setExpensePaid(expenseId, true, { update, now: NOW });

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("despesa não encontrada quando ela não existe na unidade", async () => {
    const update = vi.fn().mockResolvedValue(false);

    const result = await setExpensePaid(EXPENSE_ID, true, { update, now: NOW });

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
  });
});

describe("deleteExpense", () => {
  it("exclui a despesa", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteExpense(EXPENSE_ID, "this", remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(EXPENSE_ID, "this");
  });

  it("exclui esta e as próximas da série", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    await deleteExpense(EXPENSE_ID, "following", remove);

    expect(remove).toHaveBeenCalledWith(EXPENSE_ID, "following");
  });

  it.each(["", "all", null])("escopo %j exclui só esta despesa", async (scope) => {
    const remove = vi.fn().mockResolvedValue(true);

    await deleteExpense(EXPENSE_ID, scope, remove);

    expect(remove).toHaveBeenCalledWith(EXPENSE_ID, "this");
  });

  it.each([null, undefined, ""])("despesa não encontrada quando o id é %j", async (expenseId) => {
    const remove = vi.fn();

    const result = await deleteExpense(expenseId, "this", remove);

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("despesa não encontrada quando ela não existe na unidade", async () => {
    const result = await deleteExpense(EXPENSE_ID, "this", vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
  });
});

const RANGE = { from: "2026-09-01", to: "2026-09-30" };
const PAID_CENTS = { $sum: { $cond: [{ $ne: ["$paidAt", null] }, "$amountCents", 0] } };

describe("dailyExpenseTotalsPipeline", () => {
  it("soma por dia do lançamento o total e o que já foi pago", () => {
    expect(dailyExpenseTotalsPipeline(RANGE)).toEqual([
      { $match: { date: { $gte: "2026-09-01", $lte: "2026-09-30" } } },
      { $group: { _id: "$date", totalCents: { $sum: "$amountCents" }, paidCents: PAID_CENTS } },
      { $project: { _id: 0, date: "$_id", totalCents: 1, paidCents: 1 } },
    ]);
  });
});

describe("expenseGroupTotalsPipeline", () => {
  it("soma por grupo o total e o que já foi pago no intervalo", () => {
    expect(expenseGroupTotalsPipeline(RANGE)).toEqual([
      { $match: { date: { $gte: "2026-09-01", $lte: "2026-09-30" } } },
      { $group: { _id: "$groupId", totalCents: { $sum: "$amountCents" }, paidCents: PAID_CENTS } },
      { $project: { _id: 0, groupId: { $toString: "$_id" }, totalCents: 1, paidCents: 1 } },
    ]);
  });
});

describe("summarizeExpenseGroups", () => {
  const TAXES = { id: "g1", name: "Impostos", monthlyLimitCents: 100_000 };
  const SUPPLIES = { id: "g2", name: "Insumos", monthlyLimitCents: null };
  const RENT = { id: "g3", name: "Aluguel", monthlyLimitCents: 300_000 };

  it("junta os totais a cada grupo, com zero nos grupos sem despesas, em ordem alfabética", () => {
    const result = summarizeExpenseGroups(
      [TAXES, SUPPLIES, RENT],
      [{ groupId: "g1", totalCents: 80_000, paidCents: 50_000 }],
    );

    expect(result).toEqual([
      { ...RENT, limitCents: 300_000, totalCents: 0, paidCents: 0, overLimit: false },
      { ...TAXES, limitCents: 100_000, totalCents: 80_000, paidCents: 50_000, overLimit: false },
      { ...SUPPLIES, limitCents: null, totalCents: 0, paidCents: 0, overLimit: false },
    ]);
  });

  it("passa do limite quando o total do mês é maior que o limite, pago ou não", () => {
    const [taxes] = summarizeExpenseGroups([TAXES], [{ groupId: "g1", totalCents: 100_001, paidCents: 0 }]);

    expect(taxes.overLimit).toBe(true);
  });

  it("total igual ao limite não passa do limite", () => {
    const [taxes] = summarizeExpenseGroups([TAXES], [{ groupId: "g1", totalCents: 100_000, paidCents: 100_000 }]);

    expect(taxes.overLimit).toBe(false);
  });

  it("grupo sem limite nunca passa do limite", () => {
    const [supplies] = summarizeExpenseGroups([SUPPLIES], [{ groupId: "g2", totalCents: 9_999_999, paidCents: 0 }]);

    expect(supplies.overLimit).toBe(false);
  });

  it("ignora totais de grupos que não estão na lista", () => {
    const result = summarizeExpenseGroups([TAXES], [{ groupId: "gone", totalCents: 500, paidCents: 500 }]);

    expect(result).toEqual([{ ...TAXES, limitCents: 100_000, totalCents: 0, paidCents: 0, overLimit: false }]);
  });

  it("no ano, o limite é o mensal vezes 12 e o total do ano é comparado com ele", () => {
    const totals = [
      { groupId: "g1", totalCents: 1_200_000, paidCents: 900_000 },
      { groupId: "g3", totalCents: 3_600_001, paidCents: 0 },
    ];

    const result = summarizeExpenseGroups([TAXES, SUPPLIES, RENT], totals, 12);

    expect(result).toEqual([
      { ...RENT, limitCents: 3_600_000, totalCents: 3_600_001, paidCents: 0, overLimit: true },
      { ...TAXES, limitCents: 1_200_000, totalCents: 1_200_000, paidCents: 900_000, overLimit: false },
      { ...SUPPLIES, limitCents: null, totalCents: 0, paidCents: 0, overLimit: false },
    ]);
  });
});

describe("expenseBudgetCents", () => {
  it("soma os limites mensais dos grupos; grupo sem limite não entra", () => {
    const groups = [{ monthlyLimitCents: 100_000 }, { monthlyLimitCents: null }, { monthlyLimitCents: 250_000 }];

    expect(expenseBudgetCents(groups)).toBe(350_000);
  });

  it("sem grupos, orçamento zero", () => {
    expect(expenseBudgetCents([])).toBe(0);
  });
});

describe("splitInstallments", () => {
  it("divide igualmente quando o valor é exato", () => {
    expect(splitInstallments(30_000, 3)).toEqual([10_000, 10_000, 10_000]);
  });

  it("os centavos que sobram ficam na primeira parcela", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitInstallments(10_001, 4)).toEqual([2_501, 2_500, 2_500, 2_500]);
  });

  it("a soma das parcelas é sempre o total", () => {
    const parts = splitInstallments(99_999, 7);

    expect(parts.reduce((sum, cents) => sum + cents, 0)).toBe(99_999);
  });
});

describe("monthlyDates", () => {
  it("repete o dia a cada mês", () => {
    expect(monthlyDates("2026-09-20", 3)).toEqual(["2026-09-20", "2026-10-20", "2026-11-20"]);
  });

  it("passa para o ano seguinte depois de dezembro", () => {
    expect(monthlyDates("2026-12-15", 2)).toEqual(["2026-12-15", "2027-01-15"]);
  });

  it("em meses mais curtos usa o último dia, sem perder o dia original nos seguintes", () => {
    expect(monthlyDates("2026-01-31", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("considera fevereiro de ano bissexto", () => {
    expect(monthlyDates("2028-01-30", 2)).toEqual(["2028-01-30", "2028-02-29"]);
  });
});
