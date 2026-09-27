import { describe, it, expect, vi } from "vitest";
import { updateUnitMemberPay } from "@/lib/unit-member";
import type { MemberRole } from "@/lib/member-role";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";

describe("updateUnitMemberPay", () => {
  // findMember só encontra quem está vinculada à unidade.
  function makeDeps(member: { id: string; role: MemberRole } | null = { id: MEMBER_ID, role: "massage_therapist" }) {
    return {
      findMember: vi.fn().mockResolvedValue(member),
      update: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("dono define só comissão para uma massagista", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      { commissionPercent: " 40.25 ", salary: "", bonuses: [] },
      MEMBER_ID,
      { actorRole: "owner" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { commissionPercent: 40.25, salaryCents: null, bonuses: [] });
  });

  it("dono define só salário mensal para uma massagista", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: " 2500.50 " }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { commissionPercent: null, salaryCents: 250_050, bonuses: [] });
  });

  it("comissão e salário juntos, com bônus fixos mensais", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(
      {
        commissionPercent: "20",
        salary: "1500",
        bonuses: [
          { description: " Ajuda de custo ", amount: "200" },
          { description: "Transporte", amount: " 150.50 " },
        ],
      },
      MEMBER_ID,
      { actorRole: "owner" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      commissionPercent: 20,
      salaryCents: 150_000,
      bonuses: [
        { description: "Ajuda de custo", amountCents: 20_000 },
        { description: "Transporte", amountCents: 15_050 },
      ],
    });
  });

  it("só bônus, sem comissão nem salário", async () => {
    const deps = makeDeps({ id: MEMBER_ID, role: "receptionist" });

    const result = await updateUnitMemberPay(
      { commissionPercent: null, salary: null, bonuses: [{ description: "Prêmio", amount: "300" }] },
      MEMBER_ID,
      { actorRole: "admin" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      commissionPercent: null,
      salaryCents: null,
      bonuses: [{ description: "Prêmio", amountCents: 30_000 }],
    });
  });

  it("tudo vazio limpa a remuneração", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent: " ", salary: "" }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { commissionPercent: null, salaryCents: null, bonuses: [] });
  });

  it("admin define comissão e salário para uma recepcionista", async () => {
    const deps = makeDeps({ id: MEMBER_ID, role: "receptionist" });

    const result = await updateUnitMemberPay({ commissionPercent: "5", salary: "1800" }, MEMBER_ID, { actorRole: "admin" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { commissionPercent: 5, salaryCents: 180_000, bonuses: [] });
  });

  it.each(["0", "100", "35.5"])("aceita comissão %s", async (commissionPercent) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      commissionPercent: Number(commissionPercent),
      salaryCents: null,
      bonuses: [],
    });
  });

  it.each(["abc", "100.01", "-5", "10.123", 10])("comissão %j → invalid_commission", async (commissionPercent) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent, salary: "1000" }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_commission" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "0.00", "-100", "10.123", 1000])("salário %j → invalid_salary", async (salary) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent: "10", salary }, MEMBER_ID, { actorRole: "owner" }, deps);

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
      { actorRole: "owner" },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_bonus" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("aceita descrição de bônus com 80 caracteres", async () => {
    const deps = makeDeps();
    const description = "x".repeat(80);

    const result = await updateUnitMemberPay({ bonuses: [{ description, amount: "1" }] }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, {
      commissionPercent: null,
      salaryCents: null,
      bonuses: [{ description, amountCents: 100 }],
    });
  });

  it("admin não define a remuneração de massagista", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ salary: "2000" }, MEMBER_ID, { actorRole: "admin" }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna workspace_not_found sem buscar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent: "10" }, MEMBER_ID, { actorRole: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each(["massage_therapist", "receptionist"] as const)("%s não gerencia a equipe → forbidden", async (actorRole) => {
    const deps = makeDeps({ id: MEMBER_ID, role: "receptionist" });

    const result = await updateUnitMemberPay({ commissionPercent: "10" }, MEMBER_ID, { actorRole }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("memberId %j → member_not_found sem buscar", async (memberId) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay({ commissionPercent: "10" }, memberId, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("membro inexistente ou não vinculado à unidade → member_not_found", async () => {
    const deps = makeDeps(null);

    const result = await updateUnitMemberPay({ commissionPercent: "10" }, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([null, "texto", { bonuses: "Prêmio" }, { bonuses: {} }])("entrada %j → invalid_input", async (input) => {
    const deps = makeDeps();

    const result = await updateUnitMemberPay(input, MEMBER_ID, { actorRole: "owner" }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });
});
