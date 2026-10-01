import { describe, it, expect } from "vitest";
import { calculatePartnerShareCents, parseRevenueShare, type RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";

describe("parseRevenueShare", () => {
  it("aceita percentual fixo (uma faixa sem limite)", () => {
    const result = parseRevenueShare({ period: "monthly", limits: [], percents: ["15"] });

    expect(result).toEqual({
      ok: true,
      value: { period: "monthly", tiers: [{ upToCents: null, percent: 15 }] },
    });
  });

  it("aceita faixas: a última fica sem limite e os limites viram centavos", () => {
    const result = parseRevenueShare({
      period: "weekly",
      limits: ["30000", "50000.5"],
      percents: ["30", "35", "40.25"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        period: "weekly",
        tiers: [
          { upToCents: 3_000_000, percent: 30 },
          { upToCents: 5_000_050, percent: 35 },
          { upToCents: null, percent: 40.25 },
        ],
      },
    });
  });

  it.each(["weekly", "biweekly", "monthly"])("aceita o período %s", (period) => {
    const result = parseRevenueShare({ period, limits: [], percents: ["10"] });

    expect(result.ok).toBe(true);
  });

  it("remove espaços das pontas de limites e percentuais", () => {
    const result = parseRevenueShare({
      period: "monthly",
      limits: [" 30000 "],
      percents: [" 30 ", " 35 "],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        period: "monthly",
        tiers: [
          { upToCents: 3_000_000, percent: 30 },
          { upToCents: null, percent: 35 },
        ],
      },
    });
  });

  it.each(["0", "100", "0.01", "99.99"])("aceita percentual no limite do intervalo (%s)", (percent) => {
    const result = parseRevenueShare({ period: "monthly", limits: [], percents: [percent] });

    expect(result.ok).toBe(true);
  });

  it("aceita até 10 faixas", () => {
    const limits = Array.from({ length: 9 }, (_, i) => String((i + 1) * 1000));
    const percents = Array.from({ length: 10 }, () => "10");

    const result = parseRevenueShare({ period: "monthly", limits, percents });

    expect(result.ok).toBe(true);
  });

  const base = { period: "monthly", limits: ["30000"], percents: ["30", "35"] };

  it.each([
    ["input nulo", null, "invalid_input"],
    ["limits não é lista", { ...base, limits: "30000" }, "invalid_input"],
    ["percents não é lista", { ...base, percents: "30" }, "invalid_input"],
    ["nenhuma faixa", { ...base, limits: [], percents: [] }, "invalid_input"],
    ["limites e percentuais desalinhados", { ...base, limits: ["30000"], percents: ["30"] }, "invalid_input"],
    ["limite não é string", { ...base, limits: [30000] }, "invalid_input"],
    ["percentual não é string", { ...base, percents: ["30", 35] }, "invalid_input"],
    ["período desconhecido", { ...base, period: "yearly" }, "invalid_period"],
    ["período ausente", { ...base, period: null }, "invalid_period"],
    ["mais de 10 faixas", { ...base, limits: Array(10).fill("1"), percents: Array(11).fill("1") }, "too_many_tiers"],
    ["limite vazio", { ...base, limits: [""] }, "invalid_tier_limit"],
    ["limite zero", { ...base, limits: ["0"] }, "invalid_tier_limit"],
    ["limite negativo", { ...base, limits: ["-100"] }, "invalid_tier_limit"],
    ["limite com 3 casas decimais", { ...base, limits: ["100.123"] }, "invalid_tier_limit"],
    ["limite com vírgula", { ...base, limits: ["30000,00"] }, "invalid_tier_limit"],
    ["limite acima de R$ 1 bilhão", { ...base, limits: ["1000000000.01"] }, "invalid_tier_limit"],
    ["limites fora de ordem", { ...base, limits: ["50000", "30000"], percents: ["1", "2", "3"] }, "invalid_tier_limit"],
    ["limites repetidos", { ...base, limits: ["30000", "30000"], percents: ["1", "2", "3"] }, "invalid_tier_limit"],
    ["percentual vazio", { ...base, percents: ["", "35"] }, "invalid_tier_percent"],
    ["percentual acima de 100", { ...base, percents: ["30", "100.01"] }, "invalid_tier_percent"],
    ["percentual negativo", { ...base, percents: ["-1", "35"] }, "invalid_tier_percent"],
    ["percentual com 3 casas decimais", { ...base, percents: ["30.125", "35"] }, "invalid_tier_percent"],
    ["percentual com símbolo", { ...base, percents: ["30%", "35"] }, "invalid_tier_percent"],
  ])("retorna erro quando %s", (_label, input, error) => {
    expect(parseRevenueShare(input)).toEqual({ ok: false, error });
  });
});

describe("calculatePartnerShareCents", () => {
  const fixed: RevenueShare = {
    period: "monthly",
    tiers: [{ upToCents: null, percent: 15 }],
  };

  // Até R$ 30.000 -> 30%; acima -> 35%, sempre sobre o total.
  const tiered: RevenueShare = {
    period: "monthly",
    tiers: [
      { upToCents: 3_000_000, percent: 30 },
      { upToCents: null, percent: 35 },
    ],
  };

  it("percentual fixo incide sobre todo o faturamento", () => {
    expect(calculatePartnerShareCents(4_000_000, fixed)).toBe(600_000);
  });

  it("faturamento zero dá repasse zero", () => {
    expect(calculatePartnerShareCents(0, tiered)).toBe(0);
  });

  it("abaixo do limite usa a primeira faixa", () => {
    expect(calculatePartnerShareCents(2_000_000, tiered)).toBe(600_000);
  });

  it("exatamente no limite ainda é a primeira faixa (limite inclusivo)", () => {
    expect(calculatePartnerShareCents(3_000_000, tiered)).toBe(900_000);
  });

  it("um centavo acima do limite passa para a faixa seguinte no total", () => {
    expect(calculatePartnerShareCents(3_000_001, tiered)).toBe(1_050_000);
  });

  it("acima do limite aplica o percentual da faixa atingida sobre todo o faturamento", () => {
    // 40.000 x 35%, não 30.000 x 30% + 10.000 x 35%
    expect(calculatePartnerShareCents(4_000_000, tiered)).toBe(1_400_000);
  });

  it("com várias faixas usa a faixa onde o faturamento cai", () => {
    const share: RevenueShare = {
      period: "monthly",
      tiers: [
        { upToCents: 1_000_000, percent: 10 },
        { upToCents: 2_000_000, percent: 20 },
        { upToCents: null, percent: 50 },
      ],
    };

    expect(calculatePartnerShareCents(1_500_000, share)).toBe(300_000);
    expect(calculatePartnerShareCents(2_500_000, share)).toBe(1_250_000);
  });

  it("arredonda para o centavo mais próximo", () => {
    const share: RevenueShare = { period: "monthly", tiers: [{ upToCents: null, percent: 12.5 }] };

    // 1,01 x 12,5% = 0,12625 -> 0,13
    expect(calculatePartnerShareCents(101, share)).toBe(13);
  });
});
