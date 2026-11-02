import { describe, it, expect } from "vitest";
import { appointmentReceivable } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable";

describe("appointmentReceivable", () => {
  const startsAt = new Date("2026-10-05T17:30:00.000Z");

  it("o agendamento concluído vira um recebível no horário dele, com o nome do serviço e do cliente", () => {
    expect(appointmentReceivable({ name: "Massagem Candle", customerName: "João Silva", priceCents: 18_000, startsAt })).toEqual({
      name: "Massagem Candle · João Silva",
      valueCents: 18_000,
      accruedAt: startsAt,
    });
  });

  it("sem cliente, fica só o nome do serviço", () => {
    expect(appointmentReceivable({ name: "Massagem", customerName: null, priceCents: 100, startsAt })?.name).toBe("Massagem");
  });

  it("agendamento sem valor não gera recebível", () => {
    expect(appointmentReceivable({ name: "Massagem", customerName: "João", priceCents: 0, startsAt })).toBeNull();
  });
});
