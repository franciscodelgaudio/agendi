import { describe, it, expect } from "vitest";
import { calendarTimeRange, parseBusinessHours } from "@/lib/business-hours";

describe("parseBusinessHours", () => {
  it("devolve abertura e fechamento como chegam do formulário", () => {
    expect(parseBusinessHours({ opensAt: "08:00", closesAt: "22:30" })).toEqual({
      ok: true,
      value: { opensAt: "08:00", closesAt: "22:30" },
    });
  });

  it("remove espaços das pontas", () => {
    expect(parseBusinessHours({ opensAt: " 09:00 ", closesAt: " 18:00 " })).toEqual({
      ok: true,
      value: { opensAt: "09:00", closesAt: "18:00" },
    });
  });

  it.each([
    ["abre à meia-noite", "00:00", "12:00"],
    ["fecha à meia-noite (24:00)", "10:00", "24:00"],
    ["funciona o dia todo", "00:00", "24:00"],
  ])("aceita quando %s", (_label, opensAt, closesAt) => {
    expect(parseBusinessHours({ opensAt, closesAt })).toEqual({ ok: true, value: { opensAt, closesAt } });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["abertura não é string", { opensAt: 8, closesAt: "18:00" }, "invalid_input"],
    ["fechamento ausente", { opensAt: "08:00" }, "invalid_input"],
    ["abertura vazia", { opensAt: "", closesAt: "18:00" }, "invalid_business_hours"],
    ["hora sem dois dígitos", { opensAt: "8:00", closesAt: "18:00" }, "invalid_business_hours"],
    ["hora 24 com minutos", { opensAt: "08:00", closesAt: "24:30" }, "invalid_business_hours"],
    ["hora maior que 24", { opensAt: "08:00", closesAt: "25:00" }, "invalid_business_hours"],
    ["minuto maior que 59", { opensAt: "08:60", closesAt: "18:00" }, "invalid_business_hours"],
    ["abertura às 24:00", { opensAt: "24:00", closesAt: "24:00" }, "invalid_business_hours"],
    ["fechamento igual à abertura", { opensAt: "10:00", closesAt: "10:00" }, "invalid_business_hours_order"],
    ["fechamento antes da abertura", { opensAt: "18:00", closesAt: "08:00" }, "invalid_business_hours_order"],
  ])("retorna erro quando %s", (_label, input, error) => {
    expect(parseBusinessHours(input)).toEqual({ ok: false, error });
  });
});

describe("calendarTimeRange", () => {
  it("usa o horário da unidade", () => {
    expect(calendarTimeRange([{ opensAt: "09:00", closesAt: "18:30" }])).toEqual({
      slotMinTime: "09:00",
      slotMaxTime: "18:30",
    });
  });

  it("com várias unidades, vai da abertura mais cedo ao fechamento mais tarde", () => {
    expect(
      calendarTimeRange([
        { opensAt: "10:00", closesAt: "22:00" },
        { opensAt: "07:30", closesAt: "19:00" },
        { opensAt: "09:00", closesAt: "24:00" },
      ]),
    ).toEqual({ slotMinTime: "07:30", slotMaxTime: "24:00" });
  });

  it("sem unidades, mostra das 06:00 às 24:00", () => {
    expect(calendarTimeRange([])).toEqual({ slotMinTime: "06:00", slotMaxTime: "24:00" });
  });
});
