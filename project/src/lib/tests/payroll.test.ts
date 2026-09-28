import { describe, it, expect, vi } from "vitest";
import type { MemberRole } from "@/lib/member-role";
import {
  nextPayrollDate,
  payrollAmount,
  payrollDueDate,
  payrollReminders,
  recordPayrollPayment,
  removePayrollPayment,
  type PayrollMember,
} from "@/lib/payroll";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";

const member = (overrides: Partial<PayrollMember> = {}): PayrollMember => ({
  memberId: MEMBER_ID,
  userId: "ana",
  role: "massage_therapist",
  startDate: null,
  payDay: 5,
  commissionPercent: null,
  salaryCents: 300_000,
  bonuses: [],
  ...overrides,
});

const total = (date: string, cents: number, therapistId = "ana") => ({
  date,
  therapistId,
  therapistName: therapistId,
  count: 1,
  cents,
});

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

  it("massagista: comissão sobre os próprios serviços do mês", () => {
    const appointments = [
      total("2026-09-01", 10_000),
      total("2026-09-30", 20_000),
      total("2026-09-15", 50_000, "bia"),
      total("2026-10-01", 40_000),
      total("2026-08-31", 40_000),
    ];

    const amount = payrollAmount(member({ salaryCents: null, commissionPercent: 30 }), "2026-09", appointments);

    expect(amount).toEqual({ salaryCents: 0, commissionCents: 9_000 });
  });

  it("massagista com convite pendente não tem comissão", () => {
    const amount = payrollAmount(member({ userId: null, commissionPercent: 30 }), "2026-09", [total("2026-09-01", 10_000)]);

    expect(amount.commissionCents).toBe(0);
  });

  it("recepcionista: comissão sobre o bruto do mês, arredondada", () => {
    const appointments = [total("2026-09-01", 10_001), total("2026-09-02", 20_000, "bia"), total("2026-10-01", 99_000)];

    const amount = payrollAmount(
      member({ role: "receptionist", userId: "rita", salaryCents: 180_000, commissionPercent: 2.5 }),
      "2026-09",
      appointments,
    );

    // 2,5% de R$ 300,01 = 750,025 centavos.
    expect(amount).toEqual({ salaryCents: 180_000, commissionCents: 750 });
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
    const members = [member({ salaryCents: null, commissionPercent: 30 })];

    expect(payrollReminders(members, [], [], "2026-10-05")).toEqual([]);
  });

  it("comissão do mês entra no valor devido", () => {
    const members = [member({ salaryCents: null, commissionPercent: 30 })];

    const [reminder] = payrollReminders(members, [], [total("2026-09-10", 10_000)], "2026-10-05");

    expect(reminder).toMatchObject({ month: "2026-09", salaryCents: 0, commissionCents: 3_000 });
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
  function makeDeps(found: { id: string; role: MemberRole } | null = { id: MEMBER_ID, role: "massage_therapist" }) {
    return {
      findMember: vi.fn().mockResolvedValue(found),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }
  const INPUT = { month: "2026-09", paidOn: "2026-10-05", salary: "3000", commission: "450.50" };

  it("registra o pagamento do mês com salário e comissão", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole: "owner" }, deps);

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

    const result = await recordPayrollPayment({ ...INPUT, salary: " ", commission: "120" }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.save).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ salaryCents: 0, commissionCents: 12_000 }));
  });

  it("admin registra o pagamento de recepcionista", async () => {
    const deps = makeDeps({ id: MEMBER_ID, role: "receptionist" });

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole: "admin" }, deps)).toEqual({ ok: true });
  });

  it("salário e comissão zerados → invalid_amount", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, salary: "0", commission: "" }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["abc", "-10", "10.123", 100])("valor %j → invalid_amount", async (salary) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, salary }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_amount" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["2026-13", "2026-9", "09/2026", "", null])("mês %j → invalid_month", async (month) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, month }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_month" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "05/10/2026", "", null])("dia do pagamento %j → invalid_date", async (paidOn) => {
    const deps = makeDeps();

    const result = await recordPayrollPayment({ ...INPUT, paidOn }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_date" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("admin não registra pagamento de massagista", async () => {
    const deps = makeDeps();

    const result = await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole: "admin" }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace → workspace_not_found sem buscar", async () => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole: null }, deps)).toEqual({
      ok: false,
      error: "workspace_not_found",
    });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each(["massage_therapist", "receptionist"] as const)("%s não registra pagamentos → forbidden", async (actorRole) => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("membro inexistente ou fora da unidade → member_not_found", async () => {
    const deps = makeDeps(null);

    expect(await recordPayrollPayment(INPUT, MEMBER_ID, { actorRole: "owner" }, deps)).toEqual({
      ok: false,
      error: "member_not_found",
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([null, "texto"])("entrada %j → invalid_input", async (input) => {
    const deps = makeDeps();

    expect(await recordPayrollPayment(input, MEMBER_ID, { actorRole: "owner" }, deps)).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });
});

describe("removePayrollPayment", () => {
  function makeDeps(found: { id: string; role: MemberRole } | null = { id: MEMBER_ID, role: "receptionist" }) {
    return {
      findMember: vi.fn().mockResolvedValue(found),
      remove: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("desfaz o pagamento do mês", async () => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actorRole: "admin" }, deps)).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID, "2026-09");
  });

  it("mês inválido → invalid_month", async () => {
    const deps = makeDeps();

    expect(await removePayrollPayment("2026-00", MEMBER_ID, { actorRole: "owner" }, deps)).toEqual({
      ok: false,
      error: "invalid_month",
    });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("admin não desfaz pagamento de massagista", async () => {
    const deps = makeDeps({ id: MEMBER_ID, role: "massage_therapist" });

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actorRole: "admin" }, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("membro inexistente → member_not_found", async () => {
    const deps = makeDeps(null);

    expect(await removePayrollPayment("2026-09", MEMBER_ID, { actorRole: "owner" }, deps)).toEqual({
      ok: false,
      error: "member_not_found",
    });
  });
});
