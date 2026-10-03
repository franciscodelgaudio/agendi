import { describe, it, expect, vi } from "vitest";
import {
  nextPayrollDate,
  payrollAmount,
  payrollDueDate,
  payrollReminders,
  recordPayrollPayment,
  removePayrollPayment,
  type PayrollMember,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/team/payroll";
import type { CommissionRule } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member";
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";

const member = (overrides: Partial<PayrollMember> = {}): PayrollMember => ({
  memberId: MEMBER_ID,
  userId: "ana",
  startDate: null,
  payDay: 5,
  // Regras de comissão do vínculo, somadas; vazio sem comissão.
  commissionRules: [],
  salaryCents: 300_000,
  bonuses: [],
  ...overrides,
});

// Sem descontos: sobre os atendimentos da própria pessoa.
const rule = (overrides: Partial<CommissionRule> = {}): CommissionRule => ({
  percent: 10,
  source: "self",
  userIds: [],
  deductRevenueShare: false,
  deductExpenseGroupIds: [],
  ...overrides,
});

const total = (date: string, cents: number, therapistId = "ana") => ({
  date,
  therapistId,
  therapistName: therapistId,
  count: 1,
  cents,
});

const expense = (date: string, cents: number, groupId = "card_fees") => ({ date, groupId, cents });

describe("payrollDueDate", () => {
  it("vence no dia de pagamento do mês seguinte", () => {
    expect(payrollDueDate("2026-09", 5)).toBe("2026-10-05");
  });

  it("dia maior que o mês cai no último dia", () => {
    expect(payrollDueDate("2026-01", 31)).toBe("2026-02-28");
  });

  it("dezembro vence em janeiro do ano seguinte", () => {
    expect(payrollDueDate("2026-12", 10)).toBe("2027-01-10");
  });
});

describe("nextPayrollDate", () => {
  it("sem dia de pagamento, sem data", () => {
    expect(nextPayrollDate({ startDate: null, payDay: null }, "2026-09-27")).toBeNull();
  });

  it("dia de pagamento já passou no mês: o do mês seguinte", () => {
    expect(nextPayrollDate({ startDate: null, payDay: 5 }, "2026-09-27")).toBe("2026-10-05");
  });

  it("dia de pagamento ainda não chegou no mês: o deste mês", () => {
    expect(nextPayrollDate({ startDate: null, payDay: 5 }, "2026-10-03")).toBe("2026-10-05");
  });

  it("vence hoje é hoje", () => {
    expect(nextPayrollDate({ startDate: null, payDay: 5 }, "2026-10-05")).toBe("2026-10-05");
  });

  it("dia maior que o mês cai no último dia", () => {
    expect(nextPayrollDate({ startDate: null, payDay: 31 }, "2026-02-10")).toBe("2026-02-28");
  });

  it("dezembro passa para janeiro do ano seguinte", () => {
    expect(nextPayrollDate({ startDate: null, payDay: 10 }, "2026-12-20")).toBe("2027-01-10");
  });

  it("data de início no futuro: o pagamento do primeiro mês trabalhado", () => {
    expect(nextPayrollDate({ startDate: "2026-11-10", payDay: 5 }, "2026-09-27")).toBe("2026-12-05");
  });

  it("começou neste mês: o pagamento deste mês é do anterior, que não trabalhou", () => {
    expect(nextPayrollDate({ startDate: "2026-09-15", payDay: 25 }, "2026-09-20")).toBe("2026-10-25");
  });

  it("data de início no passado não muda a data", () => {
    expect(nextPayrollDate({ startDate: "2026-01-01", payDay: 5 }, "2026-09-27")).toBe("2026-10-05");
  });
});

describe("payrollAmount", () => {
  it("salário e bônus do mês inteiro sem data de início", () => {
    const amount = payrollAmount(member({ bonuses: [{ amountCents: 10_000 }] }), "2026-09", []);

    expect(amount).toEqual({ salaryCents: 310_000, commissionCents: 0 });
  });

  it("proporcional a partir da data de início no mês de entrada", () => {
    // Fevereiro de 2026 tem 28 dias: do dia 15 ao 28 são 14 dias.
    expect(payrollAmount(member({ startDate: "2026-02-15" }), "2026-02", []).salaryCents).toBe(150_000);
  });

  it("sem salário antes da data de início", () => {
    expect(payrollAmount(member({ startDate: "2026-10-01" }), "2026-09", []).salaryCents).toBe(0);
  });

  it("comissão sobre os próprios atendimentos: só os que a pessoa fez no mês", () => {
    const appointments = [
      total("2026-09-01", 10_000),
      total("2026-09-30", 20_000),
      total("2026-09-15", 50_000, "bia"),
      total("2026-10-01", 40_000),
      total("2026-08-31", 40_000),
    ];

    const amount = payrollAmount(member({ salaryCents: null, commissionRules: [rule({ percent: 30 })] }), "2026-09", appointments);

    expect(amount).toEqual({ salaryCents: 0, commissionCents: 9_000 });
  });

  it("comissão sobre os próprios atendimentos com convite pendente não rende nada", () => {
    const amount = payrollAmount(member({ userId: null, commissionRules: [rule({ percent: 30 })] }), "2026-09", [
      total("2026-09-01", 10_000),
    ]);

    expect(amount.commissionCents).toBe(0);
  });

  it("comissão sobre a unidade inteira, arredondada", () => {
    const appointments = [total("2026-09-01", 10_001), total("2026-09-02", 20_000, "bia"), total("2026-10-01", 99_000)];

    const amount = payrollAmount(
      member({ userId: "rita", salaryCents: 180_000, commissionRules: [rule({ source: "unit", percent: 2.5 })] }),
      "2026-09",
      appointments,
    );

    // 2,5% de R$ 300,01 = 750,025 centavos.
    expect(amount).toEqual({ salaryCents: 180_000, commissionCents: 750 });
  });

  it("comissão sobre a unidade inteira com convite pendente conta normalmente", () => {
    const amount = payrollAmount(member({ userId: null, commissionRules: [rule({ source: "unit" })] }), "2026-09", [
      total("2026-09-01", 10_000, "bia"),
    ]);

    expect(amount.commissionCents).toBe(1_000);
  });

  it("comissão sobre os atendimentos das pessoas escolhidas", () => {
    const appointments = [total("2026-09-01", 10_000), total("2026-09-02", 20_000, "bia"), total("2026-09-03", 50_000, "caio")];

    const amount = payrollAmount(
      member({ userId: "rita", salaryCents: null, commissionRules: [rule({ source: "members", userIds: ["ana", "bia"] })] }),
      "2026-09",
      appointments,
    );

    // 10% de R$ 100 + R$ 200; os atendimentos do Caio ficam de fora.
    expect(amount.commissionCents).toBe(3_000);
  });

  it("unidade descontando o repasse: bruto menos o repasse", () => {
    const share: RevenueShare = { period: "monthly", tiers: [{ upToCents: null, percent: 20 }] };
    const appointments = [total("2026-09-01", 10_000), total("2026-09-02", 20_000, "bia"), total("2026-10-01", 99_000)];

    const amount = payrollAmount(
      member({ userId: "rita", salaryCents: null, commissionRules: [rule({ source: "unit", deductRevenueShare: true })] }),
      "2026-09",
      appointments,
      share,
    );

    // 10% de R$ 300 − R$ 60 de repasse.
    expect(amount).toEqual({ salaryCents: 0, commissionCents: 2_400 });
  });

  it("repasse semanal que atravessa o mês conta só os dias do mês", () => {
    // Semana de 28/09 a 04/10: R$ 1.000 passa da faixa de R$ 500 e todo o faturamento repassa 20%.
    const share: RevenueShare = {
      period: "weekly",
      tiers: [
        { upToCents: 50_000, percent: 0 },
        { upToCents: null, percent: 20 },
      ],
    };
    const appointments = [total("2026-09-30", 40_000), total("2026-10-01", 60_000)];

    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ source: "unit", deductRevenueShare: true })] }),
      "2026-09",
      appointments,
      share,
    );

    // Setembro: R$ 400 − 20% (R$ 80) = R$ 320; 10% = R$ 32.
    expect(amount.commissionCents).toBe(3_200);
  });

  it("descontando o repasse sem repasse (espaço próprio) é sobre o bruto", () => {
    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ source: "unit", deductRevenueShare: true })] }),
      "2026-09",
      [total("2026-09-01", 10_000), total("2026-09-02", 20_000, "bia")],
      null,
    );

    expect(amount.commissionCents).toBe(3_000);
  });

  it("próprios atendimentos descontando o repasse: só a parte do repasse que cabe a eles", () => {
    const share: RevenueShare = { period: "monthly", tiers: [{ upToCents: null, percent: 20 }] };
    const appointments = [total("2026-09-01", 10_000), total("2026-09-01", 30_000, "bia")];

    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ deductRevenueShare: true })] }),
      "2026-09",
      appointments,
      share,
    );

    // Repasse do dia: R$ 80, dos quais R$ 20 sobre os R$ 100 da Ana. 10% de R$ 80.
    expect(amount.commissionCents).toBe(800);
  });

  it("unidade descontando despesas: só os grupos escolhidos, lançados no mês", () => {
    const expenses = [expense("2026-09-10", 1_000), expense("2026-10-01", 500), expense("2026-09-05", 5_000, "rent")];

    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ source: "unit", deductExpenseGroupIds: ["card_fees"] })] }),
      "2026-09",
      [total("2026-09-01", 10_000), total("2026-09-02", 20_000, "bia")],
      null,
      expenses,
    );

    // 10% de R$ 300 − R$ 10 de taxas de cartão.
    expect(amount.commissionCents).toBe(2_900);
  });

  it("próprios atendimentos descontando despesas: na proporção do faturamento da pessoa no mês", () => {
    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ deductExpenseGroupIds: ["card_fees"] })] }),
      "2026-09",
      [total("2026-09-01", 10_000), total("2026-09-20", 30_000, "bia")],
      null,
      [expense("2026-09-30", 2_000)],
    );

    // A Ana fez 1/4 do faturamento: desconta R$ 5 dos R$ 20. 10% de R$ 95.
    expect(amount.commissionCents).toBe(950);
  });

  it("descontando repasse e despesas juntos", () => {
    const share: RevenueShare = { period: "monthly", tiers: [{ upToCents: null, percent: 20 }] };

    const amount = payrollAmount(
      member({
        salaryCents: null,
        commissionRules: [rule({ source: "unit", deductRevenueShare: true, deductExpenseGroupIds: ["card_fees", "rent"] })],
      }),
      "2026-09",
      [total("2026-09-01", 30_000)],
      share,
      [expense("2026-09-10", 400), expense("2026-09-11", 600, "rent")],
    );

    // 10% de R$ 300 − R$ 60 de repasse − R$ 10 de despesas.
    expect(amount.commissionCents).toBe(2_300);
  });

  it("várias regras somadas", () => {
    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ percent: 40 }), rule({ source: "unit", percent: 2 })] }),
      "2026-09",
      [total("2026-09-01", 10_000), total("2026-09-02", 20_000, "bia")],
    );

    // 40% de R$ 100 + 2% de R$ 300.
    expect(amount.commissionCents).toBe(4_600);
  });

  it("descontos maiores que a receita zeram a regra, sem tirar das outras", () => {
    const amount = payrollAmount(
      member({
        salaryCents: null,
        commissionRules: [rule({ source: "unit", deductExpenseGroupIds: ["rent"] }), rule()],
      }),
      "2026-09",
      [total("2026-09-01", 10_000)],
      null,
      [expense("2026-09-05", 15_000, "rent")],
    );

    expect(amount.commissionCents).toBe(1_000);
  });

  it("sem faturamento no mês, despesas não geram comissão", () => {
    const amount = payrollAmount(
      member({ salaryCents: null, commissionRules: [rule({ deductExpenseGroupIds: ["card_fees"] })] }),
      "2026-09",
      [],
      null,
      [expense("2026-09-05", 1_000)],
    );

    expect(amount.commissionCents).toBe(0);
  });
});

describe("payrollReminders", () => {
  const paid = (month: string, memberId = MEMBER_ID) => ({ memberId, month });

  it("sem dia de pagamento, sem lembrete", () => {
    expect(payrollReminders([member({ payDay: null })], [], [], "2026-10-05")).toEqual([]);
  });

  it("aparece a partir de 5 dias antes do vencimento", () => {
    const members = [member({ payDay: 2 })];

    expect(payrollReminders(members, [], [], "2026-09-27")).toEqual([
      { memberId: MEMBER_ID, month: "2026-09", dueDate: "2026-10-02", overdue: false, salaryCents: 300_000, commissionCents: 0 },
    ]);
  });

  it("sem data de início, só o último mês: a 6 dias do próximo vencimento mostra o anterior, atrasado", () => {
    const members = [member({ payDay: 2 })];

    expect(payrollReminders(members, [], [], "2026-09-26")).toEqual([
      { memberId: MEMBER_ID, month: "2026-08", dueDate: "2026-09-02", overdue: true, salaryCents: 300_000, commissionCents: 0 },
    ]);
  });

  it("vence hoje não é atrasado", () => {
    const [reminder] = payrollReminders([member()], [], [], "2026-10-05");

    expect(reminder).toMatchObject({ month: "2026-09", dueDate: "2026-10-05", overdue: false });
  });

  it("com data de início, todos os meses desde ela que não foram pagos", () => {
    const members = [member({ startDate: "2026-07-10" })];

    // Julho (vence 05/08) pago; agosto (vence 05/09) atrasado; setembro (vence 05/10) ainda a 8 dias.
    const reminders = payrollReminders(members, [paid("2026-07")], [], "2026-09-27");

    expect(reminders).toEqual([
      { memberId: MEMBER_ID, month: "2026-08", dueDate: "2026-09-05", overdue: true, salaryCents: 300_000, commissionCents: 0 },
    ]);
  });

  it("meses atrasados em ordem de vencimento, com o valor proporcional do primeiro", () => {
    // Julho de 2026 tem 31 dias: do dia 10 ao 31 são 22 dias.
    const reminders = payrollReminders([member({ startDate: "2026-07-10" })], [], [], "2026-09-27");

    expect(reminders.map((reminder) => [reminder.month, reminder.salaryCents])).toEqual([
      ["2026-07", Math.round((300_000 * 22) / 31)],
      ["2026-08", 300_000],
    ]);
  });

  it("mês já pago não aparece", () => {
    expect(payrollReminders([member()], [paid("2026-09")], [], "2026-10-05")).toEqual([]);
  });

  it("pagamento de outro membro não conta", () => {
    expect(payrollReminders([member()], [paid("2026-09", "outro")], [], "2026-10-05")).toHaveLength(1);
  });

  it("valor devido zero não gera lembrete", () => {
    const members = [member({ salaryCents: null, commissionRules: [rule({ percent: 30 })] })];

    expect(payrollReminders(members, [], [], "2026-10-05")).toEqual([]);
  });

  it("comissão do mês entra no valor devido", () => {
    const members = [member({ salaryCents: null, commissionRules: [rule({ percent: 30 })] })];

    const [reminder] = payrollReminders(members, [], [total("2026-09-10", 10_000)], "2026-10-05");

    expect(reminder).toMatchObject({ month: "2026-09", salaryCents: 0, commissionCents: 3_000 });
  });

  it("comissão descontando o repasse usa o repasse da unidade", () => {
    const share: RevenueShare = { period: "monthly", tiers: [{ upToCents: null, percent: 20 }] };
    const members = [member({ salaryCents: null, commissionRules: [rule({ source: "unit", deductRevenueShare: true })] })];

    const [reminder] = payrollReminders(members, [], [total("2026-09-10", 10_000)], "2026-10-05", share);

    expect(reminder).toMatchObject({ month: "2026-09", salaryCents: 0, commissionCents: 800 });
  });

  it("comissão descontando despesas usa as despesas de cada mês", () => {
    const members = [
      member({
        startDate: "2026-08-01",
        salaryCents: null,
        commissionRules: [rule({ source: "unit", deductExpenseGroupIds: ["card_fees"] })],
      }),
    ];
    const appointments = [total("2026-08-10", 10_000), total("2026-09-10", 10_000)];
    const expenses = [expense("2026-08-15", 2_000), expense("2026-09-15", 4_000)];

    const reminders = payrollReminders(members, [], appointments, "2026-10-05", null, expenses);

    expect(reminders.map((reminder) => [reminder.month, reminder.commissionCents])).toEqual([
      ["2026-08", 800],
      ["2026-09", 600],
    ]);
  });

  it("data de início no futuro, sem lembrete", () => {
    expect(payrollReminders([member({ startDate: "2026-11-01" })], [], [], "2026-10-05")).toEqual([]);
  });

  it("vários membros ordenados pelo vencimento", () => {
    const members = [member({ memberId: "a", payDay: 5 }), member({ memberId: "b", payDay: 1 })];

    const reminders = payrollReminders(members, [], [], "2026-10-01");

    expect(reminders.map((reminder) => [reminder.memberId, reminder.dueDate])).toEqual([
      ["b", "2026-10-01"],
      ["a", "2026-10-05"],
    ]);
  });
});

describe("recordPayrollPayment", () => {
  function makeDeps(found: { id: string } | null = { id: MEMBER_ID }) {
    return {
      findMember: vi.fn().mockResolvedValue(found),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }
  const INPUT = { month: "2026-09", paidOn: "2026-10-05", salary: "3000", commission: "450.50" };

  it("registra o pagamento do mês com salário e comissão", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment(INPUT, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.save).toHaveBeenCalledWith(MEMBER_ID, {
      month: "2026-09",
      paidOn: "2026-10-05",
      salaryCents: 300_000,
      commissionCents: 45_050,
    });
  });

  it("valor vazio vale zero", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, salary: " ", commission: "120" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.save).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ salaryCents: 0, commissionCents: 12_000 }));
  });

  it("role com permissão de gerenciar o caixa registra o pagamento", async () => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actor: actorWith("cash_flow.manage") }, deps)).toEqual({ ok: true });
  });

  it.each(["", "  ", null, undefined])("sem dia do pagamento (%j) grava um ajuste ainda pendente", async (paidOn) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, paidOn }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.save).toHaveBeenCalledWith(MEMBER_ID, {
      month: "2026-09",
      paidOn: null,
      salaryCents: 300_000,
      commissionCents: 45_050,
    });
  });

  it("salário e comissão zerados → invalid_amount", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, salary: "0", commission: "" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["abc", "-10", "10.123", 100])("valor %j → invalid_amount", async (salary) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, salary }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["2026-13", "2026-9", "09/2026", "", null])("mês %j → invalid_month", async (month) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, month }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_month" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "05/10/2026", 20261005])("dia do pagamento %j → invalid_date", async (paidOn) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, paidOn }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_date" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace → workspace_not_found sem buscar", async () => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actor: null }, deps)).toEqual({
      ok: false,
      error: "workspace_not_found",
    });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each([
    ["role sem permissões", STAFF],
    ["role que só gerencia a equipe", actorWith("team.manage")],
  ] as const)("%s não registra pagamentos → forbidden", async (_label, actor) => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actor }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("membro inexistente ou fora da unidade → member_not_found", async () => {
    const deps = makeDeps(null);

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "member_not_found",
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([null, "texto"])("entrada %j → invalid_input", async (input) => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(input, MEMBER_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });
});

describe("removePayrollPayment", () => {
  function makeDeps(found: { id: string } | null = { id: MEMBER_ID }) {
    return {
      findMember: vi.fn().mockResolvedValue(found),
      remove: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("desfaz o pagamento do mês", async () => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actor: ADMIN }, deps)).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID, "2026-09");
  });

  it("mês inválido → invalid_month", async () => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-00", MEMBER_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "invalid_month",
    });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("role com permissão de gerenciar o caixa desfaz o pagamento", async () => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actor: actorWith("cash_flow.manage") }, deps)).toEqual({ ok: true });
  });

  it.each([
    ["role sem permissões", STAFF],
    ["role que só gerencia a equipe", actorWith("team.manage")],
  ] as const)("%s não desfaz pagamento → forbidden", async (_label, actor) => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actor }, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("membro inexistente → member_not_found", async () => {
    const deps = makeDeps(null);

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "member_not_found",
    });
  });
});
