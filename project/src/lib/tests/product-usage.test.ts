import { describe, it, expect } from "vitest";
import { summarizeProductUsage } from "@/service/workspace/[workspaceId]/stock/products/product-usage";

const NOW = new Date("2026-09-24T12:00:00.000Z");

function day(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

describe("summarizeProductUsage", () => {
  it("sem usos nem registros de 'acabou', não há ciclos nem média", () => {
    expect(summarizeProductUsage([], [], NOW)).toEqual({
      cycles: [],
      usesSinceLastDepletion: 0,
      averageUsesPerDepletion: null,
    });
  });

  it("com usos mas sem 'acabou', conta os usos em aberto e não tem média", () => {
    const uses = [day("2026-09-01"), day("2026-09-02"), day("2026-09-03")];

    expect(summarizeProductUsage(uses, [], NOW)).toEqual({
      cycles: [],
      usesSinceLastDepletion: 3,
      averageUsesPerDepletion: null,
    });
  });

  it("cada 'acabou' fecha um ciclo com os usos desde o anterior; a média é por ciclo fechado", () => {
    const uses = [
      day("2026-08-01"),
      day("2026-08-02"),
      day("2026-08-03"),
      // acabou em 2026-08-10
      day("2026-08-11"),
      day("2026-08-12"),
      day("2026-08-13"),
      day("2026-08-14"),
      // acabou em 2026-08-20
      day("2026-09-01"),
    ];
    const depletions = [day("2026-08-10"), day("2026-08-20")];

    expect(summarizeProductUsage(uses, depletions, NOW)).toEqual({
      cycles: [
        { depletedAt: day("2026-08-10"), uses: 3 },
        { depletedAt: day("2026-08-20"), uses: 4 },
      ],
      usesSinceLastDepletion: 1,
      averageUsesPerDepletion: 3.5,
    });
  });

  it("uso no mesmo instante do 'acabou' entra no ciclo que ele fecha", () => {
    const depletedAt = day("2026-08-10");

    const summary = summarizeProductUsage([depletedAt], [depletedAt], NOW);

    expect(summary.cycles).toEqual([{ depletedAt, uses: 1 }]);
    expect(summary.usesSinceLastDepletion).toBe(0);
  });

  it("ciclo sem usos conta como zero na média", () => {
    const uses = [day("2026-08-01"), day("2026-08-02")];
    const depletions = [day("2026-08-10"), day("2026-08-20")];

    const summary = summarizeProductUsage(uses, depletions, NOW);

    expect(summary.cycles.map((cycle) => cycle.uses)).toEqual([2, 0]);
    expect(summary.averageUsesPerDepletion).toBe(1);
  });

  it("ignora usos futuros (agendamentos que ainda não aconteceram)", () => {
    const uses = [day("2026-09-20"), new Date(NOW.getTime() + 1), day("2026-10-01")];

    expect(summarizeProductUsage(uses, [], NOW).usesSinceLastDepletion).toBe(1);
  });

  it("aceita usos e registros fora de ordem", () => {
    const uses = [day("2026-08-12"), day("2026-08-01"), day("2026-09-01"), day("2026-08-02")];
    const depletions = [day("2026-08-20"), day("2026-08-10")];

    expect(summarizeProductUsage(uses, depletions, NOW)).toEqual({
      cycles: [
        { depletedAt: day("2026-08-10"), uses: 2 },
        { depletedAt: day("2026-08-20"), uses: 1 },
      ],
      usesSinceLastDepletion: 1,
      averageUsesPerDepletion: 1.5,
    });
  });
});
