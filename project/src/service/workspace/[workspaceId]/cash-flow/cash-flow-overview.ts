import {
  applyExpenses,
  type DayRange,
  type ExpenseCashFlowAmounts,
  type ExpenseCashFlowSummary,
  type ExpenseDayCents,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow";

// Caixa de todas as unidades: cada unidade é calculada com as próprias regras e depois somada.

const ZERO: ExpenseCashFlowAmounts = {
  grossCents: 0,
  partnerShareCents: 0,
  commissionCents: 0,
  salaryCents: 0,
  expenseCents: 0,
  netCents: 0,
};

function add(a: ExpenseCashFlowAmounts, b: ExpenseCashFlowAmounts): ExpenseCashFlowAmounts {
  return {
    grossCents: a.grossCents + b.grossCents,
    partnerShareCents: a.partnerShareCents + b.partnerShareCents,
    commissionCents: a.commissionCents + b.commissionCents,
    salaryCents: a.salaryCents + b.salaryCents,
    expenseCents: a.expenseCents + b.expenseCents,
    netCents: a.netCents + b.netCents,
  };
}

// Todos os resumos têm os mesmos intervalos, na mesma ordem.
export function mergeCashFlowSummaries(buckets: DayRange[], summaries: ExpenseCashFlowSummary[]): ExpenseCashFlowSummary {
  return {
    buckets: buckets.map((bucket, i) => ({
      ...bucket,
      real: summaries.reduce((sum, summary) => add(sum, summary.buckets[i].real), ZERO),
      forecast: summaries.reduce((sum, summary) => add(sum, summary.buckets[i].forecast), ZERO),
    })),
    total: {
      real: summaries.reduce((sum, summary) => add(sum, summary.total.real), ZERO),
      forecast: summaries.reduce((sum, summary) => add(sum, summary.total.forecast), ZERO),
    },
  };
}

// Grupos de despesa de unidades diferentes com o mesmo nome contam como um só.
export function mergeGroupsByName<T extends { name: string; paidCents: number }>(groups: T[]): T[] {
  const merged = new Map<string, T>();
  for (const group of groups) {
    const key = group.name.trim().toLocaleLowerCase("pt-BR");
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, paidCents: existing.paidCents + group.paidCents } : group);
  }
  return [...merged.values()];
}

// null quando nenhuma unidade tem saldo inicial.
export function sumBalances(balances: (number | null)[]): number | null {
  const known = balances.filter((cents) => cents !== null);
  return known.length > 0 ? known.reduce((sum, cents) => sum + cents, 0) : null;
}

// Despesas da carteira nos mesmos intervalos do caixa das unidades, para somar com elas: só
// despesa, sem receita nem equipe.
export function walletExpenseSummary(buckets: DayRange[], expenses: ExpenseDayCents[]): ExpenseCashFlowSummary {
  const zero = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, netCents: 0 };
  return applyExpenses(
    { buckets: buckets.map((bucket) => ({ ...bucket, real: zero, forecast: zero })), total: { real: zero, forecast: zero } },
    expenses,
  );
}
