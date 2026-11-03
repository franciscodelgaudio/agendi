import { describe, it, expect, vi } from "vitest";
import {
  closedPeriodOverlaps,
  closeStatement,
  deleteStatement,
  netCents,
  passOnCents,
  pendingInPeriod,
  settleReceivable,
  suggestedPeriod,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const STATEMENT_ID = "64b7f0c2a1b2c3d4e5f60900";
const PARTNER_ID = "64b7f0c2a1b2c3d4e5f60a00";
const TRANSACTION_ID = "64b7f0c2a1b2c3d4e5f60b00";
const RECEIVABLE_A = "64b7f0c2a1b2c3d4e5f60911";
const RECEIVABLE_B = "64b7f0c2a1b2c3d4e5f60912";

const MANAGER = actorWith("cash_flow.manage");
const PAID_AT = new Date("2026-11-02T03:00:00.000Z");
const DUPLICATE_KEY = Object.assign(new Error("E11000"), { code: 11000 });
const OCT_1_START = new Date("2026-10-01T03:00:00.000Z");
const OCT_31_START = new Date("2026-10-31T03:00:00.000Z");
const NOV_1_START = new Date("2026-11-01T03:00:00.000Z");

describe("passOnCents", () => {
  it("é a parte do bruto que vai para o parceiro", () => {
    expect(passOnCents(280_000, 3000)).toBe(84_000);
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(passOnCents(10_001, 3333)).toBe(3333);
    expect(passOnCents(15, 5000)).toBe(8);
  });

  it("sem repasse, nada vai para o parceiro", () => {
    expect(passOnCents(280_000, 0)).toBe(0);
  });
});

describe("netCents", () => {
  it("é o que sobra do bruto depois do repasse ao parceiro", () => {
    expect(netCents(280_000, 3000)).toBe(196_000);
  });

  it("repasse e líquido somam sempre o bruto, mesmo arredondando", () => {
    expect(netCents(15, 5000)).toBe(7);
    expect(netCents(10_001, 3333) + passOnCents(10_001, 3333)).toBe(10_001);
  });

  it("sem repasse, o bruto todo entra na carteira", () => {
    expect(netCents(280_000, 0)).toBe(280_000);
  });
});


describe("pendingInPeriod", () => {
  const OTHER_UNIT_ID = "64b7f0c2a1b2c3d4e5f60721";
  const DAYS = [
    { unitId: UNIT_ID, day: "2026-09-30", count: 1, cents: 5_000 },
    { unitId: UNIT_ID, day: "2026-10-01", count: 2, cents: 20_000 },
    { unitId: OTHER_UNIT_ID, day: "2026-10-15", count: 1, cents: 7_000 },
    { unitId: UNIT_ID, day: "2026-10-31", count: 3, cents: 30_000 },
    { unitId: UNIT_ID, day: "2026-11-01", count: 1, cents: 9_000 },
  ];

  it("até uma data: soma os pendentes de todas as unidades até aquele dia, inclusive", () => {
    expect(pendingInPeriod(DAYS, { unitId: null, period: "until", from: "", to: "2026-10-31" })).toEqual({
      count: 7,
      cents: 62_000,
    });
  });

  it("até uma data ignora o início", () => {
    expect(pendingInPeriod(DAYS, { unitId: null, period: "until", from: "2026-10-15", to: "2026-10-31" })).toEqual({
      count: 7,
      cents: 62_000,
    });
  });

  it("de/até: soma só os dias entre o início e o fim, inclusive", () => {
    expect(pendingInPeriod(DAYS, { unitId: null, period: "range", from: "2026-10-01", to: "2026-10-31" })).toEqual({
      count: 6,
      cents: 57_000,
    });
  });

  it("com unidade, soma só os pendentes dela", () => {
    expect(pendingInPeriod(DAYS, { unitId: UNIT_ID, period: "range", from: "2026-10-01", to: "2026-10-31" })).toEqual({
      count: 5,
      cents: 50_000,
    });
  });

  it.each([
    ["até uma data sem a data", { period: "until", from: "", to: "" }],
    ["de/até sem o início", { period: "range", from: "", to: "2026-10-31" }],
    ["de/até com início depois do fim", { period: "range", from: "2026-11-01", to: "2026-10-31" }],
  ] as const)("%s não soma nada", (_label, period) => {
    expect(pendingInPeriod(DAYS, { unitId: null, ...period })).toEqual({ count: 0, cents: 0 });
  });
});

describe("closedPeriodOverlaps", () => {
  const OTHER_UNIT_ID = "64b7f0c2a1b2c3d4e5f60721";
  const DAYS = [
    { unitId: UNIT_ID, day: "2026-09-28", count: 1, cents: 5_000 },
    { unitId: UNIT_ID, day: "2026-10-05", count: 2, cents: 20_000 },
    { unitId: OTHER_UNIT_ID, day: "2026-10-06", count: 4, cents: 40_000 },
    { unitId: UNIT_ID, day: "2026-11-01", count: 1, cents: 9_000 },
  ];
  const STATEMENTS = [
    { name: "Hotel Fasano · setembro", from: "2026-09-01", to: "2026-09-30" },
    { name: "Hotel Fasano · outubro", from: "2026-10-01", to: "2026-10-31" },
  ];

  it("aponta os fechamentos que já cobrem dias dos pendentes selecionados, com quantos e quanto", () => {
    expect(closedPeriodOverlaps(DAYS, { unitId: UNIT_ID, period: "until", from: "", to: "2026-11-30" }, STATEMENTS)).toEqual([
      { name: "Hotel Fasano · setembro", count: 1, cents: 5_000 },
      { name: "Hotel Fasano · outubro", count: 2, cents: 20_000 },
    ]);
  });

  it("período novo sem sobras de períodos fechados não avisa", () => {
    expect(
      closedPeriodOverlaps(DAYS, { unitId: UNIT_ID, period: "range", from: "2026-11-01", to: "2026-11-30" }, STATEMENTS),
    ).toEqual([]);
  });

  it("período que cruza um fechamento, mas sem pendentes nos dias cruzados, não avisa", () => {
    expect(
      closedPeriodOverlaps(DAYS, { unitId: UNIT_ID, period: "range", from: "2026-10-20", to: "2026-11-30" }, STATEMENTS),
    ).toEqual([]);
  });

  it("fechamento de todos os pendentes até uma data cobre todos os dias até o fim dele", () => {
    const statements = [{ name: "Hotel Fasano · até setembro", from: null, to: "2026-09-30" }];

    expect(closedPeriodOverlaps(DAYS, { unitId: UNIT_ID, period: "until", from: "", to: "2026-11-30" }, statements)).toEqual([
      { name: "Hotel Fasano · até setembro", count: 1, cents: 5_000 },
    ]);
  });

  it("período inválido não avisa", () => {
    expect(closedPeriodOverlaps(DAYS, { unitId: UNIT_ID, period: "until", from: "", to: "" }, STATEMENTS)).toEqual([]);
  });
});

describe("suggestedPeriod", () => {
  it.each([
    ["primeiro fechamento: o mês passado inteiro", null, "2026-11-02", { from: "2026-10-01", to: "2026-10-31" }],
    ["depois de fechar setembro: outubro inteiro", "2026-09-30", "2026-11-02", { from: "2026-10-01", to: "2026-10-31" }],
    ["depois de um fechamento parcial: do dia seguinte ao fim do mês passado", "2026-10-15", "2026-11-02", { from: "2026-10-16", to: "2026-10-31" }],
    ["mês passado já fechado: do dia seguinte até hoje", "2026-10-31", "2026-11-02", { from: "2026-11-01", to: "2026-11-02" }],
    ["último fechamento antigo: do dia seguinte a ele ao fim do mês passado", "2026-06-30", "2026-11-02", { from: "2026-07-01", to: "2026-10-31" }],
    ["virada de ano", null, "2027-01-10", { from: "2026-12-01", to: "2026-12-31" }],
    ["fevereiro", "2026-01-31", "2026-03-05", { from: "2026-02-01", to: "2026-02-28" }],
  ])("%s", (_label, lastTo, today, period) => {
    expect(suggestedPeriod(lastTo, today)).toEqual(period);
  });
});

describe("closeStatement", () => {
  const PENDING = [
    { id: RECEIVABLE_A, valueCents: 2_000_000 },
    { id: RECEIVABLE_B, valueCents: 1_200_000 },
  ];
  const PARTNER = {
    thresholdRule: "above" as "above" | "from",
    tiers: [
      { thresholdCents: 0, shareBps: 3000 },
      { thresholdCents: 3_000_000, shareBps: 3500 },
    ],
    unit: { id: UNIT_ID, walletId: WALLET_ID as string | null } as { id: string; walletId: string | null } | null,
  };

  function makeDeps({
    partner = PARTNER as typeof PARTNER | null,
    pending = PENDING as { id: string; valueCents: number }[],
    save = vi.fn().mockResolvedValue({ id: STATEMENT_ID }),
  } = {}) {
    return {
      findPartner: vi.fn().mockResolvedValue(partner),
      findPending: vi.fn().mockResolvedValue(pending),
      save,
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MANAGER };
  const VALID = {
    name: " Hotel Fasano · outubro ",
    paidAt: "2026-11-02",
    received: "20800,00",
    period: "range",
    from: "2026-10-01",
    to: "2026-10-31",
  };

  it("de/até: confere o repasse dos pendentes da unidade do parceiro no período, com o bruto e a faixa alcançada, e lança o valor recebido", async () => {
    const deps = makeDeps();

    const result = await closeStatement(VALID, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: true, statementId: STATEMENT_ID });
    expect(deps.findPartner).toHaveBeenCalledWith(PARTNER_ID);
    expect(deps.findPending).toHaveBeenCalledWith({ walletId: WALLET_ID, unitId: UNIT_ID, from: OCT_1_START, before: NOV_1_START });
    expect(deps.save).toHaveBeenCalledWith({
      statement: {
        name: "Hotel Fasano · outubro",
        from: OCT_1_START,
        to: OCT_31_START,
        grossCents: 3_200_000,
        shareBps: 3500,
        partnerId: PARTNER_ID,
        walletId: WALLET_ID,
        workspaceId: WORKSPACE_ID,
        receivableIds: [RECEIVABLE_A, RECEIVABLE_B],
      },
      transaction: {
        name: "Hotel Fasano · outubro",
        totalCents: 2_080_000,
        type: "incoming",
        paidAt: PAID_AT,
        walletId: WALLET_ID,
        unitId: UNIT_ID,
        workspaceId: WORKSPACE_ID,
      },
    });
  });

  it("abaixo do limite aplica a primeira faixa", async () => {
    const deps = makeDeps({ pending: [{ id: RECEIVABLE_A, valueCents: 2_000_000 }] });

    await closeStatement(VALID, PARTNER_ID, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ statement: expect.objectContaining({ grossCents: 2_000_000, shareBps: 3000 }) }),
    );
  });

  it.each([
    ["above", 3000],
    ["from", 3500],
  ] as const)("bruto exatamente no limite com a regra %s aplica %i pontos-base", async (thresholdRule, shareBps) => {
    const deps = makeDeps({
      partner: { ...PARTNER, thresholdRule },
      pending: [
        { id: RECEIVABLE_A, valueCents: 1_800_000 },
        { id: RECEIVABLE_B, valueCents: 1_200_000 },
      ],
    });

    await closeStatement(VALID, PARTNER_ID, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ statement: expect.objectContaining({ shareBps }) }));
  });

  it("ignora percentual enviado: a faixa do parceiro é a palavra final", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, passOn: "0", shareBps: 0 }, PARTNER_ID, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ statement: expect.objectContaining({ shareBps: 3500 }) }));
  });

  it("até uma data: fecha todos os pendentes até o fim daquele dia, sem início", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, period: "until", from: "" }, PARTNER_ID, ctx, deps);

    expect(deps.findPending).toHaveBeenCalledWith({ walletId: WALLET_ID, unitId: UNIT_ID, from: null, before: NOV_1_START });
    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ statement: expect.objectContaining({ from: null, to: OCT_31_START }) }),
    );
  });

  it("até uma data ignora o início enviado", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, period: "until" }, PARTNER_ID, ctx, deps);

    expect(deps.findPending).toHaveBeenCalledWith(expect.objectContaining({ from: null, before: NOV_1_START }));
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ statement: expect.objectContaining({ from: null }) }));
  });

  it("de/até no mesmo dia fecha só aquele dia", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, from: "2026-10-15", to: "2026-10-15" }, PARTNER_ID, ctx, deps);

    expect(deps.findPending).toHaveBeenCalledWith({
      walletId: WALLET_ID,
      unitId: UNIT_ID,
      from: new Date("2026-10-15T03:00:00.000Z"),
      before: new Date("2026-10-16T03:00:00.000Z"),
    });
  });

  it("valor recebido diferente do esperado: lança o que entrou de fato e o repasse guarda bruto e faixa para mostrar a diferença", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, received: "20300,00" }, PARTNER_ID, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith({
      statement: expect.objectContaining({ grossCents: 3_200_000, shareBps: 3500 }),
      transaction: expect.objectContaining({ totalCents: 2_030_000 }),
    });
  });

  it("aceita valor recebido com ponto ou sem centavos", async () => {
    const deps = makeDeps();

    await closeStatement({ ...VALID, received: "20800" }, PARTNER_ID, ctx, deps);
    await closeStatement({ ...VALID, received: "20800.50" }, PARTNER_ID, ctx, deps);

    expect(deps.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ transaction: expect.objectContaining({ totalCents: 2_080_000 }) }));
    expect(deps.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ transaction: expect.objectContaining({ totalCents: 2_080_050 }) }));
  });

  it("sem pendentes no período, não fecha nada", async () => {
    const deps = makeDeps({ pending: [] });

    expect(await closeStatement(VALID, PARTNER_ID, ctx, deps)).toEqual({ ok: false, error: "no_pending_receivables" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recebível que entrou em outro fechamento no meio do caminho derruba o fechamento", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(DUPLICATE_KEY) });

    expect(await closeStatement(VALID, PARTNER_ID, ctx, deps)).toEqual({ ok: false, error: "receivable_settled" });
  });

  it("outros erros do banco sobem", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(new Error("down")) });

    await expect(closeStatement(VALID, PARTNER_ID, ctx, deps)).rejects.toThrow("down");
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome vazio", { ...VALID, name: " " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...VALID, name: "a".repeat(81) }, "name_too_long"],
    ["sem dia de recebimento", { ...VALID, paidAt: "" }, "invalid_paid_at"],
    ["dia de recebimento inválido", { ...VALID, paidAt: "2026-02-30" }, "invalid_paid_at"],
    ["sem valor recebido", { ...VALID, received: "" }, "invalid_received"],
    ["valor recebido zero", { ...VALID, received: "0,00" }, "invalid_received"],
    ["valor recebido negativo", { ...VALID, received: "-100,00" }, "invalid_received"],
    ["valor recebido que não é número", { ...VALID, received: "abc" }, "invalid_received"],
    ["sem modo de período", { ...VALID, period: undefined }, "invalid_period"],
    ["modo de período desconhecido", { ...VALID, period: "month" }, "invalid_period"],
    ["até uma data sem a data", { ...VALID, period: "until", to: "" }, "invalid_period_end"],
    ["até uma data inexistente", { ...VALID, period: "until", to: "2026-02-30" }, "invalid_period_end"],
    ["de/até sem o início", { ...VALID, from: "" }, "invalid_period_start"],
    ["de/até com início inexistente", { ...VALID, from: "2026-02-30" }, "invalid_period_start"],
    ["de/até sem o fim", { ...VALID, to: "" }, "invalid_period_end"],
    ["de/até com início depois do fim", { ...VALID, from: "2026-11-01", to: "2026-10-31" }, "period_reversed"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    expect(await closeStatement(input, PARTNER_ID, ctx, deps)).toEqual({ ok: false, error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["sem parceiro", "", makeDeps(), "partner_not_found"],
    ["parceiro que não é do workspace", PARTNER_ID, makeDeps({ partner: null }), "partner_not_found"],
    ["parceiro sem unidade", PARTNER_ID, makeDeps({ partner: { ...PARTNER, unit: null } }), "partner_without_unit"],
    [
      "unidade do parceiro sem carteira",
      PARTNER_ID,
      makeDeps({ partner: { ...PARTNER, unit: { id: UNIT_ID, walletId: null } } }),
      "unit_without_wallet",
    ],
  ] as const)("%s", async (_label, partnerId, deps, error) => {
    expect(await closeStatement(VALID, partnerId, ctx, deps)).toEqual({ ok: false, error });
    expect(deps.findPending).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o caixa", STAFF, "forbidden"],
  ] as const)("%s, não fecha", async (_label, actor, error) => {
    const deps = makeDeps();

    expect(await closeStatement(VALID, PARTNER_ID, { ...ctx, actor }, deps)).toEqual({ ok: false, error });
    expect(deps.findPartner).not.toHaveBeenCalled();
  });
});

describe("settleReceivable", () => {
  const RECEIVABLE = {
    id: RECEIVABLE_A,
    name: "Massagem · João",
    valueCents: 28_000,
    walletId: WALLET_ID,
    unitId: UNIT_ID as string | null,
    unitHasPartner: false,
  };

  function makeDeps({
    receivable = RECEIVABLE as typeof RECEIVABLE | null,
    save = vi.fn().mockResolvedValue({ id: TRANSACTION_ID }),
  } = {}) {
    return { findPendingReceivable: vi.fn().mockResolvedValue(receivable), save };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };
  const VALID = { paidAt: "2026-11-02" };

  it("confirma o pagamento de um recebível de unidade sem parceiro: vira uma entrada com o valor cheio, ligada a ele", async () => {
    const deps = makeDeps();

    const result = await settleReceivable(VALID, RECEIVABLE_A, ctx, deps);

    expect(result).toEqual({ ok: true, transactionId: TRANSACTION_ID });
    expect(deps.findPendingReceivable).toHaveBeenCalledWith(RECEIVABLE_A);
    expect(deps.save).toHaveBeenCalledWith({
      name: "Massagem · João",
      totalCents: 28_000,
      type: "incoming",
      paidAt: PAID_AT,
      walletId: WALLET_ID,
      unitId: UNIT_ID,
      workspaceId: WORKSPACE_ID,
      receivableId: RECEIVABLE_A,
    });
  });

  it("recebível sem unidade gera a entrada sem unidade", async () => {
    const deps = makeDeps({ receivable: { ...RECEIVABLE, unitId: null } });

    await settleReceivable(VALID, RECEIVABLE_A, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ unitId: null }));
  });

  it("ignora repasse enviado: sem parceiro, entra o valor cheio", async () => {
    const deps = makeDeps();

    await settleReceivable({ ...VALID, passOn: "30" }, RECEIVABLE_A, ctx, deps);

    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ totalCents: 28_000 }));
  });

  it("recusa recebível de unidade com parceiro: ele só entra num fechamento", async () => {
    const deps = makeDeps({ receivable: { ...RECEIVABLE, unitHasPartner: true } });

    expect(await settleReceivable(VALID, RECEIVABLE_A, ctx, deps)).toEqual({ ok: false, error: "receivable_has_partner" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recusa input nulo", async () => {
    expect(await settleReceivable(null, RECEIVABLE_A, ctx, makeDeps())).toEqual({ ok: false, error: "invalid_input" });
  });

  it.each(["", null, undefined, "2026-02-30"])("exige um dia de pagamento válido (%j)", async (paidAt) => {
    const deps = makeDeps();

    expect(await settleReceivable({ paidAt }, RECEIVABLE_A, ctx, deps)).toEqual({ ok: false, error: "invalid_paid_at" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["recebível que não é do workspace, já pago ou já num fechamento", RECEIVABLE_A, makeDeps({ receivable: null })],
  ])("%s devolve não encontrado", async (_label, receivableId, deps) => {
    expect(await settleReceivable(VALID, receivableId, ctx, deps)).toEqual({ ok: false, error: "receivable_not_found" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("recebível pago ou fechado no meio do caminho", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(DUPLICATE_KEY) });

    expect(await settleReceivable(VALID, RECEIVABLE_A, ctx, deps)).toEqual({ ok: false, error: "receivable_settled" });
  });

  it("outros erros do banco sobem", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(new Error("down")) });

    await expect(settleReceivable(VALID, RECEIVABLE_A, ctx, deps)).rejects.toThrow("down");
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

describe("deleteStatement", () => {
  function makeDeps(removed = true) {
    return { remove: vi.fn().mockResolvedValue(removed) };
  }

  it("desfaz a conferência: apaga o repasse e a entrada dele, devolvendo os atendimentos para pendentes", async () => {
    const deps = makeDeps();

    expect(await deleteStatement(STATEMENT_ID, { actor: MANAGER }, deps)).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(STATEMENT_ID);
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["repasse que não é do workspace ou já desfeito", STATEMENT_ID, makeDeps(false)],
  ])("%s devolve não encontrado", async (_label, statementId, deps) => {
    expect(await deleteStatement(statementId, { actor: ADMIN }, deps)).toEqual({ ok: false, error: "statement_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o caixa", STAFF, "forbidden"],
  ] as const)("%s, não desfaz", async (_label, actor, error) => {
    const deps = makeDeps();

    expect(await deleteStatement(STATEMENT_ID, { actor }, deps)).toEqual({ ok: false, error });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
