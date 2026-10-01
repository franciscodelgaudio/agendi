// Regra de repasse: quanto do faturamento da unidade, num período, fica com o
// estabelecimento parceiro onde ela funciona.

const MAX_TIERS = 10;
const MAX_LIMIT_CENTS = 100_000_000_000; // R$ 1.000.000.000,00

export const REVENUE_SHARE_PERIODS = ["weekly", "biweekly", "monthly"] as const;

export type RevenueSharePeriod = (typeof REVENUE_SHARE_PERIODS)[number];

// upToCents é inclusivo; a última faixa não tem limite (null).
export type RevenueShareTier = { upToCents: number | null; percent: number };

export type RevenueShare = {
  period: RevenueSharePeriod;
  tiers: RevenueShareTier[];
};

export type RevenueShareError =
  | "invalid_input"
  | "invalid_period"
  | "too_many_tiers"
  | "invalid_tier_limit"
  | "invalid_tier_percent";

// "30000.5" -> 3000050. Feito sobre a string para não depender de arredondamento de float.
function parseLimitCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 && cents <= MAX_LIMIT_CENTS ? cents : null;
}

// "40.25" -> 40.25, entre 0 e 100 com até 2 casas.
export function parsePercent(value: string) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return hundredths <= 10_000 ? hundredths / 100 : null;
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return options.includes(value as T);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Valida os campos como chegam do formulário: um limite por faixa, menos a última.
export function parseRevenueShare(
  input: unknown,
): { ok: true; value: RevenueShare } | { ok: false; error: RevenueShareError } {
  const { period, limits, percents } = (input ?? {}) as Record<string, unknown>;
  if (!isStringArray(limits) || !isStringArray(percents)) return { ok: false, error: "invalid_input" };
  if (!percents.length || limits.length !== percents.length - 1) return { ok: false, error: "invalid_input" };

  if (!isOneOf(REVENUE_SHARE_PERIODS, period)) return { ok: false, error: "invalid_period" };
  if (percents.length > MAX_TIERS) return { ok: false, error: "too_many_tiers" };

  const limitsCents: number[] = [];
  for (const limit of limits) {
    const cents = parseLimitCents(limit.trim());
    if (cents === null || cents <= (limitsCents.at(-1) ?? 0)) return { ok: false, error: "invalid_tier_limit" };
    limitsCents.push(cents);
  }

  const tiers: RevenueShareTier[] = [];
  for (const [i, value] of percents.entries()) {
    const percent = parsePercent(value.trim());
    if (percent === null) return { ok: false, error: "invalid_tier_percent" };
    tiers.push({ upToCents: limitsCents[i] ?? null, percent });
  }

  return { ok: true, value: { period, tiers } };
}

// Parte do faturamento do período (em centavos) que fica com o estabelecimento parceiro:
// o percentual da faixa atingida vale para todo o faturamento.
export function calculatePartnerShareCents(revenueCents: number, { tiers }: RevenueShare) {
  const tier = tiers.find((t) => t.upToCents === null || revenueCents <= t.upToCents) ?? tiers.at(-1)!;
  return Math.round((revenueCents * tier.percent) / 100);
}
