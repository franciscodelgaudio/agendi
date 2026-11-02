import { describe, it, expect, vi } from "vitest";
import {
  closeStatement,
  deleteStatement,
  parsePassOnBps,
  passOnCents,
  payStatement,
  settleReceivable,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const STATEMENT_ID = "64b7f0c2a1b2c3d4e5f60900";
const RECEIVABLE_A = "64b7f0c2a1b2c3d4e5f60911";
const RECEIVABLE_B = "64b7f0c2a1b2c3d4e5f60912";

const MANAGER = actorWith("cash_flow.manage");
const NOW = new Date("2026-11-02T15:00:00.000Z");
const PAID_AT = new Date("2026-11-02T03:00:00.000Z");
const DUPLICATE_KEY = Object.assign(new Error("E11000"), { code: 11000 });

describe("parsePassOnBps", () => {
  it.each([
    ["70", 7000],
    ["62,5", 6250],
    ["62.5", 6250],
    [" 33,33 ", 3333],
    ["100", 10_000],
    ["0,01", 1],
  ])("lê %j como %i pontos-base", (value, bps) => {
    expect(parsePassOnBps(value)).toBe(bps);
  });

  it.each(["0", "100,01", "120", "-10", "70,125", "abc", ""])("recusa %j", (value) => {
    expect(parsePassOnBps(value)).toBeNull();
  });
});

describe("passOnCents", () => {
  it("aplica a porcentagem sobre o bruto", () => {
    expect(passOnCents(280_000, 7000)).toBe(196_000);
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(passOnCents(10_001, 3333)).toBe(3333);
    expect(passOnCents(15, 5000)).toBe(8);
  });
});

describe("closeStatement", () => {
  const PENDING = [
    { id: RECEIVABLE_A, valueCents: 28_000 },
    { id: RECEIVABLE_B, valueCents: 12_000 },
  ];

  function makeDeps({
    unit = { walletId: WALLET_ID } as { walletId: string | null } | null,
    pending = PENDING as { id: string; valueCents: number }[],
    save = vi.fn().mockResolvedValue({ id: STATEMENT_ID }),
  } = {}) {
    return {
      findUnit: vi.fn().mockResolvedValue(unit),
      findPending: vi.fn().mockResolvedValue(pending),
      save,
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MANAGER, now: NOW };
  const VALID = { name: " Repasse outubro ", passOn: "70", paidAt: "" };

  it("fecha todos os pendentes da unidade num bloco com a porcentagem, ainda sem pagamento", async () => {
    const deps = makeDeps();

    const result = await closeStatement(VALID, UNIT_ID, ctx, deps);

    expect(result).toEqual({ ok: true, statementId: STATEMENT_ID });
    expect(deps.findPending).toHaveBeenCalledWith({ walletId: WALLET_ID, unitId: UNIT_ID });
    expect(deps.save).toHaveBeenCalledWith({
      statement: {
        name: "Repasse outubro",
        closedAt: NOW,
        passOnBps: 7000,
        walletId: WALLET_ID,
        unitId: UNIT_ID,
        workspaceId: WORKSPACE_ID,
        receivableIds: [RECEIVABLE_A, RECEIVABLE_B],
      },
      transaction: null,
    });
  });

  it("com dia de pagamento, já gera a entrada com o valor do repasse", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, paidAt: "2026-11-02" }, UNIT_ID, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: {
          name: "Repasse outubro",
          totalCents: 28_000,
          type: "incoming",
          paidAt: PAID_AT,
          walletId: WALLET_ID,
          unitId: UNIT_ID,
          workspaceId: WORKSPACE_ID,
        },
      }),
    );
  });

  it("sem pendentes, não fecha nada", async () => {
    const deps = makeDeps({ pending: [] });

    expect(await closeStatement(VALID, UNIT_ID, ctx, deps)).toEqual({ ok: false, error: "no_pending_receivables" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recebível que entrou em outro bloco no meio do caminho derruba o fechamento", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(DUPLICATE_KEY) });

    expect(await closeStatement(VALID, UNIT_ID, ctx, deps)).toEqual({ ok: false, error: "receivable_settled" });
  });

  it("outros erros do banco sobem", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(new Error("down")) });

    await expect(closeStatement(VALID, UNIT_ID, ctx, deps)).rejects.toThrow("down");
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome vazio", { ...VALID, name: " " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...VALID, name: "a".repeat(81) }, "name_too_long"],
    ["porcentagem zero", { ...VALID, passOn: "0" }, "invalid_pass_on"],
    ["porcentagem acima de 100", { ...VALID, passOn: "101" }, "invalid_pass_on"],
    ["dia de pagamento inválido", { ...VALID, paidAt: "2026-02-30" }, "invalid_paid_at"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    expect(await closeStatement(input, UNIT_ID, ctx, deps)).toEqual({ ok: false, error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["sem unidade", "", makeDeps(), "unit_not_found"],
    ["unidade que não é do workspace", UNIT_ID, makeDeps({ unit: null }), "unit_not_found"],
    ["unidade sem carteira", UNIT_ID, makeDeps({ unit: { walletId: null } }), "unit_without_wallet"],
  ] as const)("%s", async (_label, unitId, deps, error) => {
    expect(await closeStatement(VALID, unitId, ctx, deps)).toEqual({ ok: false, error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o caixa", STAFF, "forbidden"],
  ] as const)("%s, não fecha", async (_label, actor, error) => {
    const deps = makeDeps();

    expect(await closeStatement(VALID, UNIT_ID, { ...ctx, actor }, deps)).toEqual({ ok: false, error });
    expect(deps.findPending).not.toHaveBeenCalled();
  });
});

describe("settleReceivable", () => {
  const RECEIVABLE = {
    id: RECEIVABLE_A,
    name: "Massagem · João",
    valueCents: 28_000,
    walletId: WALLET_ID,
    unitId: UNIT_ID as string | null,
  };

  function makeDeps({
    receivable = RECEIVABLE as typeof RECEIVABLE | null,
    save = vi.fn().mockResolvedValue({ id: STATEMENT_ID }),
  } = {}) {
    return { findPendingReceivable: vi.fn().mockResolvedValue(receivable), save };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN, now: NOW };
  const VALID = { passOn: "100", paidAt: "2026-11-02" };

  it("confirma o pagamento de um recebível: bloco de um item, já pago, com o nome dele", async () => {
    const deps = makeDeps();

    const result = await settleReceivable(VALID, RECEIVABLE_A, ctx, deps);

    expect(result).toEqual({ ok: true, statementId: STATEMENT_ID });
    expect(deps.findPendingReceivable).toHaveBeenCalledWith(RECEIVABLE_A);
    expect(deps.save).toHaveBeenCalledWith({
      statement: {
        name: "Massagem · João",
        closedAt: NOW,
        passOnBps: 10_000,
        walletId: WALLET_ID,
        unitId: UNIT_ID,
        workspaceId: WORKSPACE_ID,
        receivableIds: [RECEIVABLE_A],
      },
      transaction: {
        name: "Massagem · João",
        totalCents: 28_000,
        type: "incoming",
        paidAt: PAID_AT,
        walletId: WALLET_ID,
        unitId: UNIT_ID,
        workspaceId: WORKSPACE_ID,
      },
    });
  });

  it("aplica a porcentagem do repasse", async () => {
    const deps = makeDeps();

    await settleReceivable({ ...VALID, passOn: "62,5" }, RECEIVABLE_A, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statement: expect.objectContaining({ passOnBps: 6250 }),
        transaction: expect.objectContaining({ totalCents: 17_500 }),
      }),
    );
  });

  it.each(["", null, undefined])("exige o dia do pagamento (%j)", async (paidAt) => {
    const deps = makeDeps();

    expect(await settleReceivable({ ...VALID, paidAt }, RECEIVABLE_A, ctx, deps)).toEqual({
      ok: false,
      error: "invalid_paid_at",
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recusa porcentagem inválida", async () => {
    const deps = makeDeps();

    expect(await settleReceivable({ ...VALID, passOn: "abc" }, RECEIVABLE_A, ctx, deps)).toEqual({
      ok: false,
      error: "invalid_pass_on",
    });
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["recebível que não é do workspace ou já está num bloco", RECEIVABLE_A, makeDeps({ receivable: null })],
  ])("%s devolve não encontrado", async (_label, receivableId, deps) => {
    expect(await settleReceivable(VALID, receivableId, ctx, deps)).toEqual({ ok: false, error: "receivable_not_found" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recebível fechado por outro bloco no meio do caminho", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(DUPLICATE_KEY) });

    expect(await settleReceivable(VALID, RECEIVABLE_A, ctx, deps)).toEqual({ ok: false, error: "receivable_settled" });
  });

  it("sem a permissão de gerenciar o caixa, não confirma", async () => {
    const deps = makeDeps();

    expect(await settleReceivable(VALID, RECEIVABLE_A, { ...ctx, actor: STAFF }, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(deps.findPendingReceivable).not.toHaveBeenCalled();
  });
});

describe("payStatement", () => {
  const STATEMENT = {
    name: "Repasse outubro",
    walletId: WALLET_ID,
    unitId: UNIT_ID as string | null,
    workspaceId: WORKSPACE_ID,
    passOnBps: 7000,
    grossCents: 40_000,
    paid: false,
  };

  function makeDeps(statement: typeof STATEMENT | null = STATEMENT, paid = true) {
    return { findStatement: vi.fn().mockResolvedValue(statement), pay: vi.fn().mockResolvedValue(paid) };
  }

  it("gera a entrada do bloco fechado com o valor do repasse", async () => {
    const deps = makeDeps();

    const result = await payStatement({ paidAt: "2026-11-02" }, STATEMENT_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.pay).toHaveBeenCalledWith(STATEMENT_ID, {
      name: "Repasse outubro",
      totalCents: 28_000,
      type: "incoming",
      paidAt: PAID_AT,
      walletId: WALLET_ID,
      unitId: UNIT_ID,
      workspaceId: WORKSPACE_ID,
    });
  });

  it("não paga duas vezes", async () => {
    const deps = makeDeps({ ...STATEMENT, paid: true });

    expect(await payStatement({ paidAt: "2026-11-02" }, STATEMENT_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "statement_paid",
    });
    expect(deps.pay).not.toHaveBeenCalled();
  });

  it.each(["", "2026-02-30", null])("recusa dia de pagamento %j", async (paidAt) => {
    const deps = makeDeps();

    expect(await payStatement({ paidAt }, STATEMENT_ID, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "invalid_paid_at",
    });
    expect(deps.pay).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["bloco que não é do workspace", STATEMENT_ID, makeDeps(null)],
    ["bloco pago ou excluído antes de gravar", STATEMENT_ID, makeDeps(STATEMENT, false)],
  ])("%s devolve não encontrado", async (_label, statementId, deps) => {
    expect(await payStatement({ paidAt: "2026-11-02" }, statementId, { actor: ADMIN }, deps)).toEqual({
      ok: false,
      error: "statement_not_found",
    });
  });

  it("sem a permissão de gerenciar o caixa, não paga", async () => {
    const deps = makeDeps();

    expect(await payStatement({ paidAt: "2026-11-02" }, STATEMENT_ID, { actor: STAFF }, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(deps.pay).not.toHaveBeenCalled();
  });
});

describe("deleteStatement", () => {
  function makeDeps(statement: { paid: boolean } | null = { paid: false }, removed = true) {
    return { findStatement: vi.fn().mockResolvedValue(statement), remove: vi.fn().mockResolvedValue(removed) };
  }

  it("desfaz o bloco ainda não pago, devolvendo os recebíveis para pendentes", async () => {
    const deps = makeDeps();

    expect(await deleteStatement(STATEMENT_ID, { actor: MANAGER }, deps)).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(STATEMENT_ID);
  });

  it("não desfaz o bloco pago", async () => {
    const deps = makeDeps({ paid: true });

    expect(await deleteStatement(STATEMENT_ID, { actor: ADMIN }, deps)).toEqual({ ok: false, error: "statement_paid" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["bloco que não é do workspace", STATEMENT_ID, makeDeps(null)],
    ["bloco pago ou excluído antes de remover", STATEMENT_ID, makeDeps({ paid: false }, false)],
  ])("%s devolve não encontrado", async (_label, statementId, deps) => {
    expect(await deleteStatement(statementId, { actor: ADMIN }, deps)).toEqual({ ok: false, error: "statement_not_found" });
  });

  it("sem acesso ao workspace, não desfaz", async () => {
    const deps = makeDeps();

    expect(await deleteStatement(STATEMENT_ID, { actor: null }, deps)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
