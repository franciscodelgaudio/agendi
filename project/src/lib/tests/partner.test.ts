import { describe, it, expect, vi } from "vitest";
import {
  appliedShareBps,
  createPartner,
  deletePartner,
  updatePartner,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/partner";
import { passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const PARTNER_ID = "64b7f0c2a1b2c3d4e5f60a00";

const PARTNER_MANAGER = actorWith("partners.manage");
const DUPLICATE_KEY = Object.assign(new Error("E11000"), { code: 11000 });

const VALID_INPUT = {
  name: "  Hotel Fasano  ",
  thresholdRule: "above",
  tiers: [
    { threshold: "0", share: "30" },
    { threshold: "30000,00", share: "35" },
  ],
  unitId: UNIT_ID,
};

const SAVED_DATA = {
  name: "Hotel Fasano",
  thresholdRule: "above",
  tiers: [
    { thresholdCents: 0, shareBps: 3000 },
    { thresholdCents: 3_000_000, shareBps: 3500 },
  ],
  unitId: UNIT_ID,
};

const INVALID_INPUTS: [string, unknown, string][] = [
  ["input nulo", null, "invalid_input"],
  ["nome ausente", { ...VALID_INPUT, name: undefined }, "invalid_input"],
  ["nome vazio", { ...VALID_INPUT, name: "  " }, "invalid_name"],
  ["nome com mais de 60 caracteres", { ...VALID_INPUT, name: "a".repeat(61) }, "name_too_long"],
  ["regra de limite desconhecida", { ...VALID_INPUT, thresholdRule: "below" }, "invalid_threshold_rule"],
  ["faixas ausentes", { ...VALID_INPUT, tiers: undefined }, "invalid_tiers"],
  ["nenhuma faixa", { ...VALID_INPUT, tiers: [] }, "invalid_tiers"],
  [
    "mais de 10 faixas",
    { ...VALID_INPUT, tiers: Array.from({ length: 11 }, (_, index) => ({ threshold: String(index * 1000), share: "30" })) },
    "invalid_tiers",
  ],
  ["limite inválido", { ...VALID_INPUT, tiers: [{ threshold: "0", share: "30" }, { threshold: "abc", share: "35" }] }, "invalid_tier_threshold"],
  ["limite negativo", { ...VALID_INPUT, tiers: [{ threshold: "0", share: "30" }, { threshold: "-10", share: "35" }] }, "invalid_tier_threshold"],
  ["percentual inválido", { ...VALID_INPUT, tiers: [{ threshold: "0", share: "trinta" }] }, "invalid_tier_share"],
  ["percentual de 100%", { ...VALID_INPUT, tiers: [{ threshold: "0", share: "100" }] }, "invalid_tier_share"],
  ["primeira faixa que não começa em zero", { ...VALID_INPUT, tiers: [{ threshold: "100", share: "30" }] }, "first_tier_not_zero"],
  [
    "limites fora de ordem",
    {
      ...VALID_INPUT,
      tiers: [
        { threshold: "0", share: "30" },
        { threshold: "50000", share: "40" },
        { threshold: "30000", share: "35" },
      ],
    },
    "tiers_not_increasing",
  ],
  [
    "dois limites iguais",
    {
      ...VALID_INPUT,
      tiers: [
        { threshold: "0", share: "30" },
        { threshold: "30000", share: "35" },
        { threshold: "30000", share: "40" },
      ],
    },
    "tiers_not_increasing",
  ],
];

describe("createPartner", () => {
  function makeDeps() {
    return {
      unitExists: vi.fn().mockResolvedValue(true),
      insert: vi.fn().mockResolvedValue({ id: PARTNER_ID }),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: PARTNER_MANAGER };

  it("cria o parceiro vinculado à unidade com as faixas em centavos e pontos-base", async () => {
    const deps = makeDeps();

    const result = await createPartner(VALID_INPUT, ctx, deps);

    expect(result).toEqual({ ok: true, partnerId: PARTNER_ID });
    expect(deps.unitExists).toHaveBeenCalledWith(UNIT_ID);
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ...SAVED_DATA });
  });

  it("aceita percentual com decimais e regra \"a partir de\"", async () => {
    const deps = makeDeps();

    await createPartner(
      { ...VALID_INPUT, thresholdRule: "from", tiers: [{ threshold: "0", share: "12,5" }, { threshold: "1000.50", share: "99,99" }] },
      ctx,
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        thresholdRule: "from",
        tiers: [
          { thresholdCents: 0, shareBps: 1250 },
          { thresholdCents: 100_050, shareBps: 9999 },
        ],
      }),
    );
  });

  it("sem unidade, cria o parceiro sem vínculo e não consulta unidade", async () => {
    const deps = makeDeps();

    await createPartner({ ...VALID_INPUT, unitId: null }, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(deps.unitExists).not.toHaveBeenCalled();
    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ unitId: null }));
  });

  it("recusa quem não tem a permissão de parceiros", async () => {
    const deps = makeDeps();

    const result = await createPartner(VALID_INPUT, { workspaceId: WORKSPACE_ID, actor: actorWith("cash_flow.manage", "units.manage") }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace", async () => {
    const result = await createPartner(VALID_INPUT, { workspaceId: WORKSPACE_ID, actor: null }, makeDeps());

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
  });

  it.each(INVALID_INPUTS)("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createPartner(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["id malformado", "abc"],
    ["unidade de outro workspace ou inexistente", UNIT_ID],
  ])("recusa %s", async (_label, unitId) => {
    const deps = makeDeps();
    deps.unitExists.mockResolvedValue(false);

    const result = await createPartner({ ...VALID_INPUT, unitId }, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que já tem parceiro", async () => {
    const deps = makeDeps();
    deps.insert.mockRejectedValue(DUPLICATE_KEY);

    const result = await createPartner(VALID_INPUT, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_has_partner" });
  });

  it("repassa outros erros do banco", async () => {
    const deps = makeDeps();
    deps.insert.mockRejectedValue(new Error("boom"));

    await expect(createPartner(VALID_INPUT, ctx, deps)).rejects.toThrow("boom");
  });
});

describe("updatePartner", () => {
  function makeDeps() {
    return {
      unitExists: vi.fn().mockResolvedValue(true),
      update: vi.fn().mockResolvedValue(true),
    };
  }
  const ctx = { actor: PARTNER_MANAGER };

  it("salva nome, regra, faixas e unidade", async () => {
    const deps = makeDeps();

    const result = await updatePartner(VALID_INPUT, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(PARTNER_ID, SAVED_DATA);
  });

  it("desvincula da unidade com unitId nulo", async () => {
    const deps = makeDeps();

    await updatePartner({ ...VALID_INPUT, unitId: null }, PARTNER_ID, ctx, deps);

    expect(deps.unitExists).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith(PARTNER_ID, expect.objectContaining({ unitId: null }));
  });

  it("recusa quem não tem a permissão de parceiros", async () => {
    const deps = makeDeps();

    const result = await updatePartner(VALID_INPUT, PARTNER_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("parceiro sem id (%j)", async (partnerId) => {
    const result = await updatePartner(VALID_INPUT, partnerId, ctx, makeDeps());

    expect(result).toEqual({ ok: false, error: "partner_not_found" });
  });

  it("parceiro inexistente", async () => {
    const deps = makeDeps();
    deps.update.mockResolvedValue(false);

    const result = await updatePartner(VALID_INPUT, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "partner_not_found" });
  });

  it.each(INVALID_INPUTS)("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updatePartner(input, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa unidade inexistente", async () => {
    const deps = makeDeps();
    deps.unitExists.mockResolvedValue(false);

    const result = await updatePartner(VALID_INPUT, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa unidade que já tem outro parceiro", async () => {
    const deps = makeDeps();
    deps.update.mockRejectedValue(DUPLICATE_KEY);

    const result = await updatePartner(VALID_INPUT, PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "unit_has_partner" });
  });
});

describe("deletePartner", () => {
  function makeDeps() {
    return {
      hasStatements: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(true),
    };
  }
  const ctx = { actor: PARTNER_MANAGER };

  it("exclui o parceiro sem fechamentos", async () => {
    const deps = makeDeps();

    const result = await deletePartner(PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.hasStatements).toHaveBeenCalledWith(PARTNER_ID);
    expect(deps.remove).toHaveBeenCalledWith(PARTNER_ID);
  });

  it("recusa parceiro que já tem fechamentos", async () => {
    const deps = makeDeps();
    deps.hasStatements.mockResolvedValue(true);

    const result = await deletePartner(PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "partner_has_statements" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("recusa quem não tem a permissão de parceiros", async () => {
    const deps = makeDeps();

    const result = await deletePartner(PARTNER_ID, { actor: actorWith("cash_flow.manage") }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.hasStatements).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("parceiro sem id (%j)", async (partnerId) => {
    const result = await deletePartner(partnerId, ctx, makeDeps());

    expect(result).toEqual({ ok: false, error: "partner_not_found" });
  });

  it("parceiro inexistente", async () => {
    const deps = makeDeps();
    deps.remove.mockResolvedValue(false);

    const result = await deletePartner(PARTNER_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "partner_not_found" });
  });
});

const AIRA_TIERS = [
  { thresholdCents: 0, shareBps: 3000 },
  { thresholdCents: 3_000_000, shareBps: 3500 },
];

const THREE_TIERS = [
  { thresholdCents: 0, shareBps: 2500 },
  { thresholdCents: 1_000_000, shareBps: 3000 },
  { thresholdCents: 5_000_000, shareBps: 4000 },
];

describe("appliedShareBps", () => {
  describe("regra \"acima de\"", () => {
    it.each([
      [0, 3000],
      [1, 3000],
      [2_999_999, 3000],
      [3_000_000, 3000],
      [3_000_001, 3500],
      [3_200_000, 3500],
    ])("com bruto de %i centavos aplica %i pontos-base", (grossCents, bps) => {
      expect(appliedShareBps({ thresholdRule: "above", tiers: AIRA_TIERS }, grossCents)).toBe(bps);
    });

    it("com três faixas o valor exato de cada limite fica na faixa de baixo", () => {
      const partner = { thresholdRule: "above" as const, tiers: THREE_TIERS };

      expect(appliedShareBps(partner, 1_000_000)).toBe(2500);
      expect(appliedShareBps(partner, 1_000_001)).toBe(3000);
      expect(appliedShareBps(partner, 5_000_000)).toBe(3000);
      expect(appliedShareBps(partner, 5_000_001)).toBe(4000);
    });
  });

  describe("regra \"a partir de\"", () => {
    it.each([
      [0, 3000],
      [1, 3000],
      [2_999_999, 3000],
      [3_000_000, 3500],
      [3_000_001, 3500],
      [3_200_000, 3500],
    ])("com bruto de %i centavos aplica %i pontos-base", (grossCents, bps) => {
      expect(appliedShareBps({ thresholdRule: "from", tiers: AIRA_TIERS }, grossCents)).toBe(bps);
    });

    it("com três faixas o valor exato de cada limite já entra na faixa de cima", () => {
      const partner = { thresholdRule: "from" as const, tiers: THREE_TIERS };

      expect(appliedShareBps(partner, 999_999)).toBe(2500);
      expect(appliedShareBps(partner, 1_000_000)).toBe(3000);
      expect(appliedShareBps(partner, 4_999_999)).toBe(3000);
      expect(appliedShareBps(partner, 5_000_000)).toBe(4000);
    });
  });

  it.each(["above", "from"] as const)("com uma faixa só e regra %s aplica sempre a mesma", (thresholdRule) => {
    const partner = { thresholdRule, tiers: [{ thresholdCents: 0, shareBps: 2000 }] };

    expect(appliedShareBps(partner, 0)).toBe(2000);
    expect(appliedShareBps(partner, 100_000_000)).toBe(2000);
  });

  it("a faixa alcançada vale sobre o bruto inteiro, não só sobre o excedente", () => {
    const grossCents = 3_200_000;
    const bps = appliedShareBps({ thresholdRule: "above", tiers: AIRA_TIERS }, grossCents);

    expect(passOnCents(grossCents, bps)).toBe(1_120_000);
  });
});
