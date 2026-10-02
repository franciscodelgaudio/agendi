import { describe, it, expect, vi } from "vitest";
import { updateUnitMemberPay } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";

describe("updateUnitMemberPay", () => {
  // findMember só encontra quem está vinculada à unidade.
  function makeDeps(member: { id: string } | null = { id: MEMBER_ID }) {
    return {
      findMember: vi.fn().mockResolvedValue(member),
      update: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("administrador define só comissão", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      { commissionBase: "services", commissionPercent: " 40.25 ", salary: "", bonuses: [] },
      MEMBER_ID,
      { actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { startDate: null, payDay: null, commissionBase: "services", commissionPercent: 40.25, salaryCents: null, bonuses: [] });
  });

  it("administrador define só salário mensal", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: " 2500.50 " }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { startDate: null, payDay: null, commissionBase: null, commissionPercent: null, salaryCents: 250_050, bonuses: [] });
  });

  it("comissão e salário juntos, com bônus fixos mensais", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      {
        commissionBase: "services",
        commissionPercent: "20",
        salary: "1500",
        bonuses: [
          { description: " Ajuda de custo ", amount: "200" },
          { description: "Transporte", amount: " 150.50 " },
        ],
      },
      MEMBER_ID,
      { actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: null,
      payDay: null,
      commissionBase: "services",
      commissionPercent: 20,
      salaryCents: 150_000,
      bonuses: [
        { description: "Ajuda de custo", amountCents: 20_000 },
        { description: "Transporte", amountCents: 15_050 },
      ],
    });
  });

  it("só bônus, sem comissão nem salário", async () => {
    const deps = makeDeps({ id: MEMBER_ID });

    const result = await updateUnitMemberPay(
      { commissionBase: "services", commissionPercent: null, salary: null, bonuses: [{ description: "Prêmio", amount: "300" }] },
      MEMBER_ID,
      { actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: null,
      payDay: null,
      commissionBase: null,
      commissionPercent: null,
      salaryCents: null,
      bonuses: [{ description: "Prêmio", amountCents: 30_000 }],
    });
  });

  it("tudo vazio limpa a remuneração", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: " ", salary: "" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { startDate: null, payDay: null, commissionBase: null, commissionPercent: null, salaryCents: null, bonuses: [] });
  });

  it("role com permissão de gerenciar a equipe define comissão e salário", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      { commissionBase: "services", commissionPercent: "5", salary: "1800" },
      MEMBER_ID,
      { actor: actorWith("team.manage") },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { startDate: null, payDay: null, commissionBase: "services", commissionPercent: 5, salaryCents: 180_000, bonuses: [] });
  });

  it.each(["0", "100", "35.5"])("aceita comissão %s", async (commissionPercent) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: null,
      payDay: null,
      commissionBase: "services",
      commissionPercent: Number(commissionPercent),
      salaryCents: null,
      bonuses: [],
    });
  });

  // Base da comissão escolhida no vínculo: os serviços que a pessoa fez ou o bruto da unidade.
  it("comissão sobre o bruto da unidade", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "gross", commissionPercent: "2.5" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: null,
      payDay: null,
      commissionBase: "gross",
      commissionPercent: 2.5,
      salaryCents: null,
      bonuses: [],
    });
  });

  it("comissão sobre o líquido da unidade (bruto menos o repasse)", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "net", commissionPercent: "4" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ commissionBase: "net", commissionPercent: 4 }));
  });

  it("sem comissão, a base não é guardada", async () => {
    const deps = makeDeps();

    await updateUnitMemberPay({ commissionBase: "gross", commissionPercent: "", salary: "1000" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ commissionBase: null, commissionPercent: null }));
  });

  it.each([undefined, null, "", "bruto", 1])(
    "comissão definida com base %j → invalid_commission_base",
    async (commissionBase) => {
      const deps = makeDeps();

      const result = await updateUnitMemberPay({ commissionBase, commissionPercent: "10" }, MEMBER_ID, { actor: ADMIN }, deps);

      expect(result).toEqual({ ok: false, error: "invalid_commission_base" });
      expect(deps.update).not.toHaveBeenCalled();
    },
  );

  it.each(["abc", "100.01", "-5", "10.123", 10])("comissão %j → invalid_commission", async (commissionPercent) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent, salary: "1000" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_commission" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "0.00", "-100", "10.123", 1000])("salário %j → invalid_salary", async (salary) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: "10", salary }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_salary" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    { description: "", amount: "100" },
    { description: "   ", amount: "100" },
    { description: "Prêmio", amount: "" },
    { description: "Prêmio", amount: "0" },
    { description: "Prêmio", amount: "abc" },
    { description: "Prêmio", amount: "10.123" },
    { description: 1, amount: "100" },
    { description: "Prêmio", amount: 100 },
    { description: "x".repeat(81), amount: "100" },
    null,
    "Prêmio",
  ])("bônus %j → invalid_bonus", async (bonus) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      { bonuses: [{ description: "Ajuda de custo", amount: "200" }, bonus] },
      MEMBER_ID,
      { actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_bonus" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("aceita descrição de bônus com 80 caracteres", async () => {
    const deps = makeDeps();
    const description = "x".repeat(80);

    const result = await updateUnitMemberPay({ bonuses: [{ description, amount: "1" }] }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: null,
      payDay: null,
      commissionBase: null,
      commissionPercent: null,
      salaryCents: null,
      bonuses: [{ description, amountCents: 100 }],
    });
  });

  it("data de início na unidade vai junto com a remuneração", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "3000", startDate: " 2026-02-15 " }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      startDate: "2026-02-15",
      payDay: null,
      commissionBase: null,
      commissionPercent: null,
      salaryCents: 300_000,
      bonuses: [],
    });
  });

  it.each(["", "   ", null])("data de início %j fica sem data", async (startDate) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "3000", startDate }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ startDate: null }));
  });

  it.each(["15/02/2026", "2026-02-30", "2026-2-15", "abc", 20260215])("data de início %j → invalid_start_date", async (startDate) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "3000", startDate }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_start_date" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["5", 5],
    [" 31 ", 31],
    ["1", 1],
    ["", null],
    [null, null],
  ])("dia de pagamento %j → %j", async (payDay, expected) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "3000", payDay }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, expect.objectContaining({ payDay: expected }));
  });

  it.each(["0", "32", "5.5", "abc", 5])("dia de pagamento %j → invalid_pay_day", async (payDay) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "3000", payDay }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_pay_day" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna workspace_not_found sem buscar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: "10" }, MEMBER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each([
    ["role sem permissões", STAFF],
    ["role que só gerencia unidades", actorWith("units.manage")],
  ] as const)("%s não gerencia a equipe → forbidden", async (_label, actor) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: "10" }, MEMBER_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("memberId %j → member_not_found sem buscar", async (memberId) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: "10" }, memberId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("membro inexistente ou não vinculado à unidade → member_not_found", async () => {
    const deps = makeDeps(null);

    const result = await updateUnitMemberPay({ commissionBase: "services", commissionPercent: "10" }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([null, "texto", { bonuses: "Prêmio" }, { bonuses: {} }])("entrada %j → invalid_input", async (input) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(input, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });
});
