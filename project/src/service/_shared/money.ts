const MAX_PRICE_CENTS = 100_000_000;

export function parsePriceCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

export function parseMoneyCents(value: string) {
  return parsePriceCents(value.trim().replace(",", "."));
}
