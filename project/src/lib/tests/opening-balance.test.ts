import { describe, it, expect } from "vitest";
import { openingBalanceRange, parseOpeningBalance } from "@/lib/opening-balance";

describe("parseOpeningBalance", () => {
  it.each([
    ["ausente", undefined],
    ["null", null],
    ["sem valor", { amount: "", date: "2026-09-01" }],
    ["valor só com espaços", { amount: "   ", date: "" }],
  ])("sem saldo quando %s", (_label, input) => {
    expect(parseOpeningBalance(input)).toEqual({ ok: true, value: null });
  });

  it("converte o valor em centavos e guarda o dia", () => {
    expect(parseOpeningBalance({ amount: "1500.50", date: "2026-09-01" })).toEqual({
      ok: true,
      value: { amountCents: 150_050, date: "2026-09-01" },
    });
  });

  it("aceita saldo zerado", () => {
    expect(parseOpeningBalance({ amount: "0.00", date: "2026-09-01" })).toEqual({
      ok: true,
      value: { amountCents: 0, date: "2026-09-01" },
    });
  });

  it("remove espaços das pontas", () => {
    expect(parseOpeningBalance({ amount: " 20 ", date: " 2026-09-01 " })).toEqual({
      ok: true,
      value: { amountCents: 2_000, date: "2026-09-01" },
    });
  });

  it.each(["abc", "-10", "1.234", "1,50"])("recusa o valor %j", (amount) => {
    expect(parseOpeningBalance({ amount, date: "2026-09-01" })).toEqual({ ok: false, error: "invalid_opening_balance" });
  });

  it.each([undefined, "", "01/09/2026", "2026-02-30"])("recusa o dia %j quando há valor", (date) => {
    expect(parseOpeningBalance({ amount: "100.00", date })).toEqual({
      ok: false,
      error: "invalid_opening_balance_date",
    });
  });

  it.each([
    ["texto no lugar do objeto", "100"],
    ["valor que não é texto", { amount: 100, date: "2026-09-01" }],
    ["dia que não é texto", { amount: "100", date: 20260901 }],
  ])("recusa %s", (_label, input) => {
    expect(parseOpeningBalance(input)).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("openingBalanceRange", () => {
  it("vai do dia do saldo inicial até hoje", () => {
    expect(openingBalanceRange({ amountCents: 100, date: "2026-09-01" }, "2026-09-24")).toEqual({
      from: "2026-09-01",
      to: "2026-09-24",
    });
  });

  it("saldo informado hoje cobre só o dia de hoje", () => {
    expect(openingBalanceRange({ amountCents: 100, date: "2026-09-24" }, "2026-09-24")).toEqual({
      from: "2026-09-24",
      to: "2026-09-24",
    });
  });

  it("sem intervalo quando o saldo inicial é de um dia futuro", () => {
    expect(openingBalanceRange({ amountCents: 100, date: "2026-09-25" }, "2026-09-24")).toBeNull();
  });
});
