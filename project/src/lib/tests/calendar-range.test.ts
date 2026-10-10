import { describe, it, expect } from "vitest";
import { calendarRange } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-range";

describe("calendarRange", () => {
  it("mostra uma hora antes da abertura e uma depois do fechamento", () => {
    expect(calendarRange([{ opensAt: "08:00", closesAt: "18:00" }])).toEqual({ start: "07:00", end: "19:00" });
  });

  it("arredonda meia hora para a hora cheia de fora", () => {
    expect(calendarRange([{ opensAt: "08:30", closesAt: "18:30" }])).toEqual({ start: "07:00", end: "20:00" });
  });

  it("não passa da meia-noite nos dois lados", () => {
    expect(calendarRange([{ opensAt: "00:30", closesAt: "23:30" }])).toEqual({ start: "00:00", end: "24:00" });
    expect(calendarRange([{ opensAt: "00:00", closesAt: "24:00" }])).toEqual({ start: "00:00", end: "24:00" });
  });

  it("com várias unidades, cobre da abertura mais cedo ao fechamento mais tarde", () => {
    expect(
      calendarRange([
        { opensAt: "09:00", closesAt: "22:00" },
        { opensAt: "07:00", closesAt: "18:00" },
      ]),
    ).toEqual({ start: "06:00", end: "23:00" });
  });

  it("sem unidades, mostra o dia inteiro", () => {
    expect(calendarRange([])).toEqual({ start: "00:00", end: "24:00" });
  });
});
