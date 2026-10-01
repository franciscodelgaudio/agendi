export type ProductUsageSummary = {
  // Um ciclo por "acabou", em ordem cronológica, com os usos desde o anterior.
  cycles: { depletedAt: Date; uses: number }[];
  usesSinceLastDepletion: number;
  // Média de usos por ciclo fechado; null enquanto o produto nunca acabou.
  averageUsesPerDepletion: number | null;
};

// Usos são as datas de atendimentos/agendamentos com o produto; os futuros ainda não contam.
export function summarizeProductUsage(useDates: Date[], depletedAt: Date[], now: Date): ProductUsageSummary {
  const uses = useDates.map((date) => date.getTime()).filter((time) => time <= now.getTime());
  const depletions = depletedAt.map((date) => date.getTime()).sort((a, b) => a - b);

  // Um uso no mesmo instante do "acabou" entra no ciclo que ele fecha.
  let previous = -Infinity;
  const cycles = depletions.map((time) => {
    const count = uses.filter((use) => use > previous && use <= time).length;
    previous = time;
    return { depletedAt: new Date(time), uses: count };
  });

  const total = cycles.reduce((sum, cycle) => sum + cycle.uses, 0);
  return {
    cycles,
    usesSinceLastDepletion: uses.filter((use) => use > previous).length,
    averageUsesPerDepletion: cycles.length ? total / cycles.length : null,
  };
}
