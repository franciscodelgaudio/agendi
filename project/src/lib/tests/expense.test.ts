import { describe, it, expect, vi } from "vitest";
import {
  createExpense,
  monthlyDates,
  splitInstallments,
  dailyExpenseTotalsPipeline,
  deleteExpense,
  expenseGroupTotalsPipeline,
  expenseGroupMonthTotalsPipeline,
  expenseGroupYearOverview,
  groupLimitForMonth,
  payrollExpenseRows,
  setGroupLimitFrom,
  setGroupLimitForMonth,
  setExpensePaid,
  staffExpenseGroups,
  staffExpenses,
  summarizeExpenseGroups,
  updateExpense,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60730";
// Dono da despesa: a unidade ou a carteira.
const UNIT = { unitId: UNIT_ID };
const WALLET = { walletId: WALLET_ID };
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

    const result = await createExpense(validInput, UNIT, deps);

    expect(result).toEqual({ ok: true, expenseIds: [`${EXPENSE_ID}-1`] });
    expect(deps.groupExists).toHaveBeenCalledWith(UNIT, GROUP_ID);
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

    await createExpense({ ...validInput, paid: "on" }, UNIT, deps);

    expect(deps.insert).toHaveBeenCalledWith([expect.objectContaining({ paidAt: NOW })]);
  });

  it("remove espaços das pontas da descrição, do valor e do dia", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, description: "  Luz  ", amount: " 10 ", date: " 2026-09-01 " }, UNIT, deps);

    expect(deps.insert).toHaveBeenCalledWith([
      expect.objectContaining({ description: "Luz", amountCents: 1_000, date: "2026-09-01" }),
    ]);
  });

  it("aceita descrição com exatamente 80 caracteres", async () => {
    const deps = makeDeps();

    const result = await createExpense({ ...validInput, description: "a".repeat(80) }, UNIT, deps);

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

    const result = await createExpense(input, UNIT, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("parcelada divide o valor total em lançamentos mensais da mesma série", async () => {
    const deps = makeDeps();

    const result = await createExpense(
      { ...validInput, amount: "100.00", date: "2026-01-31", repeat: "installments", count: "3" },
      UNIT,
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

    await createExpense({ ...validInput, amount: "1200.00", repeat: "recurring", count: "2" }, UNIT, deps);

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

    await createExpense({ ...validInput, paid: "on", repeat: "recurring", count: "3" }, UNIT, deps);

    const entries = deps.insert.mock.calls[0][0] as { paidAt: Date | null }[];
    expect(entries.map((entry) => entry.paidAt)).toEqual([NOW, null, null]);
  });

  it.each(["none", "", undefined])("repetição %j cria um lançamento só, ignorando a quantidade", async (repeat) => {
    const deps = makeDeps();

    await createExpense({ ...validInput, repeat, count: "5" }, UNIT, deps);

    expect(deps.insert).toHaveBeenCalledWith([expect.objectContaining({ series: null })]);
  });

  it("aceita série com 60 lançamentos", async () => {
    const deps = makeDeps();

    const result = await createExpense({ ...validInput, repeat: "recurring", count: "60" }, UNIT, deps);

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

    const result = await createExpense(input, UNIT, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("não usa grupo de outra unidade", async () => {
    const deps = makeDeps({ groupExists: false });

    const result = await createExpense(validInput, UNIT, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("cria a despesa na carteira, sem unidade, com o grupo da carteira", async () => {
    const deps = makeDeps();

    const result = await createExpense(validInput, WALLET, deps);

    expect(result).toEqual({ ok: true, expenseIds: [`${EXPENSE_ID}-1`] });
    expect(deps.groupExists).toHaveBeenCalledWith(WALLET, GROUP_ID);
    expect(deps.insert).toHaveBeenCalledWith([
      {
        walletId: WALLET_ID,
        groupId: GROUP_ID,
        description: "DAS de setembro",
        amountCents: 85_040,
        date: "2026-09-20",
        paidAt: null,
        series: null,
      },
    ]);
  });

  it("série da carteira grava todos os lançamentos na carteira", async () => {
    const deps = makeDeps();

    await createExpense({ ...validInput, repeat: "recurring", count: "2" }, WALLET, deps);

    const entries = deps.insert.mock.calls[0][0] as Record<string, unknown>[];
    expect(entries.map((entry) => [entry.walletId, entry.unitId])).toEqual([
      [WALLET_ID, undefined],
      [WALLET_ID, undefined],
    ]);
  });

  it.each([null, undefined, { unitId: "" }, { walletId: "" }])("dono não encontrado quando é %j", async (owner) => {
    const deps = makeDeps();

    const result = await createExpense(validInput, owner, deps);

    expect(result).toEqual({ ok: false, error: "owner_not_found" });
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

    const result = await updateExpense({ ...validInput, paid: "on" }, UNIT, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(
      EXPENSE_ID,
      { groupId: GROUP_ID, description: "DAS de setembro", amountCents: 85_040, date: "2026-09-20" },
      "this",
    );
  });

  it("nesta e nas próximas da série, atualiza grupo, descrição e valor, mas não o dia de cada uma", async () => {
    const deps = makeDeps();

    const result = await updateExpense({ ...validInput, scope: "following" }, UNIT, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(
      EXPENSE_ID,
      { groupId: GROUP_ID, description: "DAS de setembro", amountCents: 85_040 },
      "following",
    );
  });

  it.each(["this", "", "all", undefined])("escopo %j altera só esta despesa", async (scope) => {
    const deps = makeDeps();

    await updateExpense({ ...validInput, scope }, UNIT, EXPENSE_ID, deps);

    expect(deps.update).toHaveBeenCalledWith(EXPENSE_ID, expect.objectContaining({ date: "2026-09-20" }), "this");
  });

  it("não salva quando o valor é inválido", async () => {
    const deps = makeDeps();

    const result = await updateExpense({ ...validInput, amount: "1.234" }, UNIT, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não move para grupo de outra unidade", async () => {
    const deps = makeDeps({ groupExists: false });

    const result = await updateExpense(validInput, UNIT, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("na carteira, confere o grupo na carteira", async () => {
    const deps = makeDeps();

    const result = await updateExpense(validInput, WALLET, EXPENSE_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.groupExists).toHaveBeenCalledWith(WALLET, GROUP_ID);
  });

  it.each([
    ["sem dono", null, EXPENSE_ID],
    ["sem id da carteira", { walletId: "" }, EXPENSE_ID],
    ["sem despesa", UNIT, ""],
  ])("despesa não encontrada quando %s", async (_label, owner, expenseId) => {
    const deps = makeDeps();

    const result = await updateExpense(validInput, owner, expenseId, deps);

    expect(result).toEqual({ ok: false, error: "expense_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("despesa não encontrada quando ela não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await updateExpense(validInput, UNIT, EXPENSE_ID, deps);

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

describe("expenseGroupMonthTotalsPipeline", () => {
  it("soma o pago de cada grupo em cada mês do lançamento", () => {
    expect(expenseGroupMonthTotalsPipeline({ from: "2026-01-01", to: "2026-12-31" })).toEqual([
      { $match: { date: { $gte: "2026-01-01", $lte: "2026-12-31" }, paidAt: { $ne: null } } },
      {
        $group: {
          _id: { groupId: "$groupId", month: { $substrBytes: ["$date", 0, 7] } },
          paidCents: { $sum: "$amountCents" },
        },
      },
      { $project: { _id: 0, groupId: { $toString: "$_id.groupId" }, month: "$_id.month", paidCents: 1 } },
    ]);
  });
});

describe("groupLimitForMonth", () => {
  it("sem mudanças, vale o limite do grupo em todos os meses", () => {
    expect(groupLimitForMonth({ monthlyLimitCents: 10_000, limitChanges: [] }, "2026-10")).toBe(10_000);
    expect(groupLimitForMonth({ monthlyLimitCents: null, limitChanges: [] }, "2026-10")).toBeNull();
  });

  it("a mudança vale a partir do mês dela; antes, vale o limite do grupo", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-11", cents: 15_000 }] };

    expect(groupLimitForMonth(group, "2026-10")).toBe(10_000);
    expect(groupLimitForMonth(group, "2026-11")).toBe(15_000);
    expect(groupLimitForMonth(group, "2027-03")).toBe(15_000);
  });

  it("vale a última mudança até o mês, em qualquer ordem da lista", () => {
    const group = {
      monthlyLimitCents: null,
      limitChanges: [
        { month: "2026-12", cents: 20_000 },
        { month: "2026-03", cents: 5_000 },
      ],
    };

    expect(groupLimitForMonth(group, "2026-02")).toBeNull();
    expect(groupLimitForMonth(group, "2026-06")).toBe(5_000);
    expect(groupLimitForMonth(group, "2026-12")).toBe(20_000);
  });

  it("uma mudança pode tirar o limite a partir do mês dela", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-11", cents: null }] };

    expect(groupLimitForMonth(group, "2026-12")).toBeNull();
  });
});

describe("setGroupLimitFrom", () => {
  it("acrescenta a mudança em ordem de mês, mantendo as outras", () => {
    const changes = [
      { month: "2026-03", cents: 5_000 },
      { month: "2026-12", cents: 20_000 },
    ];

    expect(setGroupLimitFrom(changes, "2026-07", 8_000)).toEqual([
      { month: "2026-03", cents: 5_000 },
      { month: "2026-07", cents: 8_000 },
      { month: "2026-12", cents: 20_000 },
    ]);
  });

  it("troca a mudança que já existe no mesmo mês", () => {
    expect(setGroupLimitFrom([{ month: "2026-11", cents: 15_000 }], "2026-11", null)).toEqual([
      { month: "2026-11", cents: null },
    ]);
  });

  it("não altera a lista recebida", () => {
    const changes = [{ month: "2026-11", cents: 15_000 }];

    setGroupLimitFrom(changes, "2026-01", 1_000);

    expect(changes).toEqual([{ month: "2026-11", cents: 15_000 }]);
  });
});

describe("setGroupLimitForMonth", () => {
  const limits = (group: Parameters<typeof groupLimitForMonth>[0], months: string[]) =>
    months.map((month) => groupLimitForMonth(group, month));

  it("muda só o mês editado; o seguinte volta ao limite que já valia", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [] };

    const limitChanges = setGroupLimitForMonth(group, "2026-11", 15_000);

    expect(limitChanges).toEqual([
      { month: "2026-11", cents: 15_000 },
      { month: "2026-12", cents: 10_000 },
    ]);
    expect(limits({ ...group, limitChanges }, ["2026-10", "2026-11", "2026-12", "2027-03"])).toEqual([
      10_000, 15_000, 10_000, 10_000,
    ]);
  });

  it("quando o mês seguinte já tem mudança, ela fica como está", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-12", cents: 20_000 }] };

    expect(setGroupLimitForMonth(group, "2026-11", 15_000)).toEqual([
      { month: "2026-11", cents: 15_000 },
      { month: "2026-12", cents: 20_000 },
    ]);
  });

  it("troca a mudança do próprio mês, sem levar o valor novo para os meses seguintes", () => {
    // R$ 150 de novembro em diante; editar novembro para R$ 120 mantém dezembro com R$ 150.
    const group = { monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-11", cents: 15_000 }] };

    const limitChanges = setGroupLimitForMonth(group, "2026-11", 12_000);

    expect(limits({ ...group, limitChanges }, ["2026-10", "2026-11", "2026-12"])).toEqual([10_000, 12_000, 15_000]);
  });

  it("pode tirar o limite só do mês editado", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [] };

    const limitChanges = setGroupLimitForMonth(group, "2026-11", null);

    expect(limits({ ...group, limitChanges }, ["2026-10", "2026-11", "2026-12"])).toEqual([10_000, null, 10_000]);
  });

  it("em dezembro, o mês seguinte é janeiro do ano seguinte", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [] };

    expect(setGroupLimitForMonth(group, "2026-12", 15_000)).toEqual([
      { month: "2026-12", cents: 15_000 },
      { month: "2027-01", cents: 10_000 },
    ]);
  });

  it("não altera o grupo recebido", () => {
    const group = { monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-03", cents: 5_000 }] };

    setGroupLimitForMonth(group, "2026-11", 15_000);

    expect(group.limitChanges).toEqual([{ month: "2026-03", cents: 5_000 }]);
  });
});

describe("summarizeExpenseGroups", () => {
  const TAXES = { id: "g1", name: "Impostos", monthlyLimitCents: 100_000, limitChanges: [] };
  const SUPPLIES = { id: "g2", name: "Insumos", monthlyLimitCents: null, limitChanges: [] };
  const RENT = { id: "g3", name: "Aluguel", monthlyLimitCents: 300_000, limitChanges: [] };
  // IPTU: R$ 100 por mês até outubro e R$ 150 a partir de novembro.
  const IPTU = { id: "g4", name: "IPTU", monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-11", cents: 15_000 }] };
  const SEP = ["2026-09"];
  const YEAR = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

  it("junta os totais a cada grupo, com zero nos grupos sem despesas, em ordem alfabética", () => {
    const result = summarizeExpenseGroups(
      [TAXES, SUPPLIES, RENT],
      [{ groupId: "g1", totalCents: 80_000, paidCents: 50_000 }],
      SEP,
    );

    expect(result).toEqual([
      { ...RENT, limitCents: 300_000, totalCents: 0, paidCents: 0, overLimit: false },
      { ...TAXES, limitCents: 100_000, totalCents: 80_000, paidCents: 50_000, overLimit: false },
      { ...SUPPLIES, limitCents: null, totalCents: 0, paidCents: 0, overLimit: false },
    ]);
  });

  it("no mês, o limite é o daquele mês", () => {
    expect(summarizeExpenseGroups([IPTU], [], ["2026-10"])[0].limitCents).toBe(10_000);
    expect(summarizeExpenseGroups([IPTU], [], ["2026-11"])[0].limitCents).toBe(15_000);
  });

  it("passa do limite quando o total do mês é maior que o limite, pago ou não", () => {
    const [taxes] = summarizeExpenseGroups([TAXES], [{ groupId: "g1", totalCents: 100_001, paidCents: 0 }], SEP);

    expect(taxes.overLimit).toBe(true);
  });

  it("total igual ao limite não passa do limite", () => {
    const [taxes] = summarizeExpenseGroups([TAXES], [{ groupId: "g1", totalCents: 100_000, paidCents: 100_000 }], SEP);

    expect(taxes.overLimit).toBe(false);
  });

  it("grupo sem limite nunca passa do limite", () => {
    const [supplies] = summarizeExpenseGroups([SUPPLIES], [{ groupId: "g2", totalCents: 9_999_999, paidCents: 0 }], SEP);

    expect(supplies.overLimit).toBe(false);
  });

  it("ignora totais de grupos que não estão na lista", () => {
    const result = summarizeExpenseGroups([TAXES], [{ groupId: "gone", totalCents: 500, paidCents: 500 }], SEP);

    expect(result).toEqual([{ ...TAXES, limitCents: 100_000, totalCents: 0, paidCents: 0, overLimit: false }]);
  });

  it("no ano, o limite soma o de cada mês e o total do ano é comparado com ele", () => {
    const totals = [
      { groupId: "g1", totalCents: 1_200_000, paidCents: 900_000 },
      { groupId: "g3", totalCents: 3_600_001, paidCents: 0 },
    ];

    const result = summarizeExpenseGroups([TAXES, SUPPLIES, RENT, IPTU], totals, YEAR);

    expect(result).toEqual([
      { ...RENT, limitCents: 3_600_000, totalCents: 3_600_001, paidCents: 0, overLimit: true },
      { ...TAXES, limitCents: 1_200_000, totalCents: 1_200_000, paidCents: 900_000, overLimit: false },
      { ...SUPPLIES, limitCents: null, totalCents: 0, paidCents: 0, overLimit: false },
      // 10 meses de R$ 100 e 2 de R$ 150.
      { ...IPTU, limitCents: 130_000, totalCents: 0, paidCents: 0, overLimit: false },
    ]);
  });

  it("no ano, os meses sem limite não somam; o grupo só fica sem limite se nenhum mês tiver", () => {
    const fromNovember = { id: "g5", name: "Seguro", monthlyLimitCents: null, limitChanges: [{ month: "2026-11", cents: 5_000 }] };

    expect(summarizeExpenseGroups([fromNovember], [], YEAR)[0].limitCents).toBe(10_000);
    expect(summarizeExpenseGroups([fromNovember], [], ["2026-10"])[0].limitCents).toBeNull();
  });
});

describe("expenseGroupYearOverview", () => {
  const RENT = { id: "g1", name: "Aluguel", monthlyLimitCents: 300_000, limitChanges: [] };
  const IPTU = { id: "g2", name: "IPTU", monthlyLimitCents: 10_000, limitChanges: [{ month: "2026-11", cents: 15_000 }] };
  const SUPPLIES = { id: "g3", name: "Insumos", monthlyLimitCents: null, limitChanges: [] };
  const cell = (plannedCents: number | null, paidCents: number) => ({ plannedCents, paidCents });

  const result = expenseGroupYearOverview(
    [SUPPLIES, IPTU, RENT],
    [
      { groupId: "g1", month: "2026-01", paidCents: 300_000 },
      { groupId: "g2", month: "2026-01", paidCents: 10_000 },
      { groupId: "g3", month: "2026-01", paidCents: 4_500 },
      { groupId: "g2", month: "2026-12", paidCents: 15_000 },
      { groupId: "gone", month: "2026-01", paidCents: 999 },
      { groupId: "g1", month: "2025-12", paidCents: 999 },
    ],
    "2026",
  );

  it("tem os grupos em ordem alfabética, que são as colunas", () => {
    expect(result.groups).toEqual([
      { id: "g1", name: "Aluguel" },
      { id: "g3", name: "Insumos" },
      { id: "g2", name: "IPTU" },
    ]);
  });

  it("tem uma linha por mês do ano, com o limite e o pago de cada grupo naquele mês e a soma da linha", () => {
    expect(result.rows.map((row) => row.month)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);
    expect(result.rows[0]).toEqual({
      month: "2026-01",
      cells: [cell(300_000, 300_000), cell(null, 4_500), cell(10_000, 10_000)],
      plannedCents: 310_000,
      paidCents: 314_500,
    });
    expect(result.rows[10]).toEqual({
      month: "2026-11",
      cells: [cell(300_000, 0), cell(null, 0), cell(15_000, 0)],
      plannedCents: 315_000,
      paidCents: 0,
    });
    expect(result.rows[11]).toEqual({
      month: "2026-12",
      cells: [cell(300_000, 0), cell(null, 0), cell(15_000, 15_000)],
      plannedCents: 315_000,
      paidCents: 15_000,
    });
  });

  it("o total soma os meses de cada grupo; grupo sem limite em nenhum mês fica sem planejado", () => {
    expect(result.total).toEqual({
      cells: [cell(3_600_000, 300_000), cell(null, 4_500), cell(130_000, 25_000)],
      plannedCents: 3_730_000,
      paidCents: 329_500,
    });
  });

  it("sem grupos, as linhas não têm colunas e somam zero", () => {
    const empty = expenseGroupYearOverview([], [], "2026");

    expect(empty.groups).toEqual([]);
    expect(empty.rows).toHaveLength(12);
    expect(empty.rows[0]).toEqual({ month: "2026-01", cells: [], plannedCents: 0, paidCents: 0 });
    expect(empty.total).toEqual({ cells: [], plannedCents: 0, paidCents: 0 });
  });
});

describe("staffExpenseGroups", () => {
  // Custos da equipe e repasse do período; bruto, líquido e despesas não entram nos grupos.
  const amounts = (partnerShareCents: number, commissionCents: number, salaryCents: number) => ({
    grossCents: 999_999,
    partnerShareCents,
    commissionCents,
    salaryCents,
    netCents: -1,
  });

  it("equipe tem limite no salário com bônus e na comissão previstos, e lançado e pago no que já correu", () => {
    const result = staffExpenseGroups({ real: amounts(300, 200, 1_500), forecast: amounts(300, 200, 3_000) });

    expect(result).toEqual([
      {
        id: "team",
        name: "Equipe",
        automatic: true,
        monthlyLimitCents: 3_200,
        limitCents: 3_200,
        totalCents: 1_700,
        paidCents: 1_700,
        overLimit: false,
      },
      {
        id: "partner_share",
        name: "Repasse",
        automatic: true,
        monthlyLimitCents: 300,
        limitCents: 300,
        totalCents: 300,
        paidCents: 300,
        overLimit: false,
      },
    ]);
  });

  it("sem repasse, só aparece a equipe", () => {
    const result = staffExpenseGroups({ real: amounts(0, 50, 0), forecast: amounts(0, 50, 0) });

    expect(result.map((group) => group.id)).toEqual(["team"]);
  });

  it("sem salário, bônus nem comissão, só aparece o repasse", () => {
    const result = staffExpenseGroups({ real: amounts(80, 0, 0), forecast: amounts(80, 0, 0) });

    expect(result.map((group) => group.id)).toEqual(["partner_share"]);
  });

  it("sem custos de equipe nem repasse, não há grupos automáticos", () => {
    expect(staffExpenseGroups({ real: amounts(0, 0, 0), forecast: amounts(0, 0, 0) })).toEqual([]);
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

describe("staffExpenses", () => {
  // Valores reais do mês; bruto e líquido não viram despesa.
  const real = (partnerShareCents: number, commissionCents: number, salaryCents: number) => ({
    grossCents: 999_999,
    partnerShareCents,
    commissionCents,
    salaryCents,
    netCents: -1,
  });

  it("vira uma despesa paga e automática por tipo, no dia dado, nos grupos equipe e repasse", () => {
    const result = staffExpenses(real(33_600, 27_329, 20_000), "2026-10-31");

    expect(result).toEqual([
      {
        id: "commission",
        groupId: "team",
        description: "Comissões",
        amountCents: 27_329,
        date: "2026-10-31",
        paid: true,
        series: null,
        automatic: true,
      },
      {
        id: "salary",
        groupId: "team",
        description: "Salários",
        amountCents: 20_000,
        date: "2026-10-31",
        paid: true,
        series: null,
        automatic: true,
      },
      {
        id: "partner_share",
        groupId: "partner_share",
        description: "Repasse",
        amountCents: 33_600,
        date: "2026-10-31",
        paid: true,
        series: null,
        automatic: true,
      },
    ]);
  });

  it("tipo sem valor no mês não aparece", () => {
    const result = staffExpenses(real(0, 15_000, 0), "2026-10-31");

    expect(result.map((expense) => expense.id)).toEqual(["commission"]);
  });

  it("sem custo da equipe nem repasse, não há despesa automática", () => {
    expect(staffExpenses(real(0, 0, 0), "2026-10-31")).toEqual([]);
  });
});

describe("payrollExpenseRows", () => {
  // Remuneração calculada do mês inteiro de cada pessoa.
  const JANE = { memberId: "jane", name: "Jane", salaryCents: 280_000, commissionCents: 4_000 };
  const ANA = { memberId: "ana", name: "Ana", salaryCents: 0, commissionCents: 7_840 };
  const row = (kind: "salary" | "commission", person: { memberId: string; name: string }, amountCents: number, payroll: object, paid = false) => ({
    id: `${kind}:${person.memberId}`,
    groupId: "team",
    description: `${kind === "salary" ? "Salário" : "Comissão"} · ${person.name}`,
    amountCents,
    date: "2026-10-31",
    paid,
    series: null,
    automatic: true,
    payroll: { memberId: person.memberId, ...payroll },
  });

  it("sem registro: salário e comissão calculados, pendentes, no dia dado", () => {
    const result = payrollExpenseRows([JANE], [], "2026-10-31");

    const payroll = { salaryCents: 280_000, commissionCents: 4_000, paidOn: null, recorded: false };
    expect(result).toEqual([row("salary", JANE, 280_000, payroll), row("commission", JANE, 4_000, payroll)]);
  });

  it("pago: os valores do registro trocam os calculados e as duas linhas ficam pagas", () => {
    const payment = { memberId: "jane", salaryCents: 300_000, commissionCents: 5_000, paidOn: "2026-11-12" };

    const result = payrollExpenseRows([JANE], [payment], "2026-10-31");

    const payroll = { salaryCents: 300_000, commissionCents: 5_000, paidOn: "2026-11-12", recorded: true };
    expect(result).toEqual([row("salary", JANE, 300_000, payroll, true), row("commission", JANE, 5_000, payroll, true)]);
  });

  it("ajuste sem data: valores do registro, ainda pendentes", () => {
    const payment = { memberId: "jane", salaryCents: 250_000, commissionCents: 4_000, paidOn: null };

    const result = payrollExpenseRows([JANE], [payment], "2026-10-31");

    expect(result.map(({ amountCents, paid }) => ({ amountCents, paid }))).toEqual([
      { amountCents: 250_000, paid: false },
      { amountCents: 4_000, paid: false },
    ]);
    expect(result[0].payroll).toEqual({ memberId: "jane", salaryCents: 250_000, commissionCents: 4_000, paidOn: null, recorded: true });
  });

  it("linha sem valor não aparece, mesmo com registro", () => {
    const payment = { memberId: "jane", salaryCents: 280_000, commissionCents: 0, paidOn: "2026-11-12" };

    const result = payrollExpenseRows([ANA, JANE], [payment], "2026-10-31");

    expect(result.map((expense) => expense.id)).toEqual(["commission:ana", "salary:jane"]);
  });

  it("ordena pelo nome e, de cada pessoa, salário antes da comissão", () => {
    const bia = { memberId: "bia", name: "Bia", salaryCents: 100_000, commissionCents: 1_000 };

    const result = payrollExpenseRows([JANE, bia, ANA], [], "2026-10-31");

    expect(result.map((expense) => expense.id)).toEqual([
      "commission:ana",
      "salary:bia",
      "commission:bia",
      "salary:jane",
      "commission:jane",
    ]);
  });

  it("registro de quem não está na lista é ignorado", () => {
    const payment = { memberId: "lia", salaryCents: 100_000, commissionCents: 0, paidOn: "2026-11-12" };

    expect(payrollExpenseRows([], [payment], "2026-10-31")).toEqual([]);
  });
});
