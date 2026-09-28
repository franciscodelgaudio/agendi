import type { TherapistAmounts, TherapistSummary } from "@/lib/cash-flow";
import type { ExpenseGroupSummary } from "@/lib/expense";
import { first, type SearchParams, type SortDir } from "@/lib/unit-list";

export const CASH_FLOW_PAGE_SIZE = 20;

const EXPENSE_SORT_FIELDS = ["date", "description", "group", "amount"] as const;
const EXPENSE_STATUSES = ["paid", "pending"] as const;
const GROUP_SORT_FIELDS = ["name", "total", "paid"] as const;
// over: passou do limite; within: tem limite e não passou; none: sem limite.
const GROUP_LIMITS = ["over", "within", "none"] as const;
const THERAPIST_SORT_FIELDS = ["name", "real"] as const;

export type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];
export type GroupLimitFilter = (typeof GROUP_LIMITS)[number];
export type TherapistSortField = (typeof THERAPIST_SORT_FIELDS)[number];

// Filtros vazios = todos.
export type ExpenseListQuery = {
  q: string;
  group: string;
  status: ExpenseStatus | "";
  sort: ExpenseSortField;
  dir: SortDir;
  page: number;
};
export type ExpenseGroupListQuery = { q: string; limit: GroupLimitFilter | ""; sort: GroupSortField; dir: SortDir; page: number };
export type TherapistListQuery = { q: string; sort: TherapistSortField; dir: SortDir; page: number };

export type ExpenseListItem = {
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
  date: string;
  paid: boolean;
};

function pick<T extends string>(values: readonly T[], value: string | undefined): T | "" {
  return values.includes(value as T) ? (value as T) : "";
}

function parseDir(params: SearchParams): SortDir | "" {
  return pick(["asc", "desc"], first(params.dir));
}

function parsePage(params: SearchParams) {
  const page = first(params.page);
  return page && /^[1-9]\d*$/.test(page) ? Number(page) : 1;
}

function parseQ(params: SearchParams) {
  return first(params.q)?.trim() ?? "";
}

// Minúsculas e sem acentos, para a busca.
function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

// Ordena (estável: empates mantêm a ordem recebida) e corta a página pedida.
function sortAndPage<T>(rows: T[], compare: (a: T, b: T) => number, dir: SortDir, page: number) {
  const sorted = [...rows].sort((a, b) => compare(a, b) * (dir === "desc" ? -1 : 1));
  const start = (page - 1) * CASH_FLOW_PAGE_SIZE;
  return { rows: sorted.slice(start, start + CASH_FLOW_PAGE_SIZE), total: sorted.length };
}

export function parseExpenseListQuery(params: SearchParams): ExpenseListQuery {
  return {
    q: parseQ(params),
    group: first(params.group) ?? "",
    status: pick(EXPENSE_STATUSES, first(params.status)),
    sort: pick(EXPENSE_SORT_FIELDS, first(params.sort)) || "date",
    dir: parseDir(params) || "asc",
    page: parsePage(params),
  };
}

// Recebe as despesas do mês por dia e criação; os totais são de todas as filtradas, não só da página.
// Os grupos dão o nome usado na ordenação por grupo.
export function expenseListPage<T extends ExpenseListItem>(
  expenses: T[],
  { q, group, status, sort, dir, page }: ExpenseListQuery,
  groups: { id: string; name: string }[] = [],
) {
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const groupName = (expense: T) => groupNames.get(expense.groupId) ?? "";
  const term = normalize(q);
  const filtered = expenses.filter(
    (expense) =>
      (!group || expense.groupId === group) &&
      (!status || expense.paid === (status === "paid")) &&
      (!term || normalize(expense.description).includes(term)),
  );
  const compare = (a: T, b: T) =>
    sort === "description"
      ? compareText(a.description, b.description)
      : sort === "group"
        ? compareText(groupName(a), groupName(b))
        : sort === "amount"
          ? a.amountCents - b.amountCents
          : a.date.localeCompare(b.date);
  return {
    ...sortAndPage(filtered, compare, dir, page),
    totalCents: filtered.reduce((sum, expense) => sum + expense.amountCents, 0),
    paidCents: filtered.reduce((sum, expense) => sum + (expense.paid ? expense.amountCents : 0), 0),
  };
}

export function parseExpenseGroupListQuery(params: SearchParams): ExpenseGroupListQuery {
  return {
    q: parseQ(params),
    limit: pick(GROUP_LIMITS, first(params.limit)),
    sort: pick(GROUP_SORT_FIELDS, first(params.sort)) || "name",
    dir: parseDir(params) || "asc",
    page: parsePage(params),
  };
}

// Recebe o resumo por nome, que desempata as demais ordenações.
export function expenseGroupListPage<T extends ExpenseGroupSummary>(
  groups: T[],
  { q, limit, sort, dir, page }: ExpenseGroupListQuery,
) {
  const term = normalize(q);
  const limitOf = (group: T): GroupLimitFilter =>
    group.monthlyLimitCents === null ? "none" : group.overLimit ? "over" : "within";
  const filtered = groups.filter(
    (group) => (!limit || limitOf(group) === limit) && (!term || normalize(group.name).includes(term)),
  );
  const compare = (a: T, b: T) =>
    sort === "total" ? a.totalCents - b.totalCents : sort === "paid" ? a.paidCents - b.paidCents : compareText(a.name, b.name);
  return {
    ...sortAndPage(filtered, compare, dir, page),
    // Somas de todos os filtrados; o planejado é o limite do período, e sem limite não soma.
    sums: {
      totalCents: filtered.reduce((sum, group) => sum + group.totalCents, 0),
      paidCents: filtered.reduce((sum, group) => sum + group.paidCents, 0),
      limitCents: filtered.reduce((sum, group) => sum + (group.limitCents ?? 0), 0),
    },
  };
}

export function parseTherapistListQuery(params: SearchParams): TherapistListQuery {
  const sort = pick(THERAPIST_SORT_FIELDS, first(params.sort)) || "real";
  return {
    q: parseQ(params),
    sort,
    // Sem direção, nome em ordem alfabética e valores do maior para o menor.
    dir: parseDir(params) || (sort === "name" ? "asc" : "desc"),
    page: parsePage(params),
  };
}

function sumAmounts(rows: TherapistAmounts[]): TherapistAmounts {
  return rows.reduce(
    (total, amounts) => ({
      count: total.count + amounts.count,
      cents: total.cents + amounts.cents,
      commissionCents: total.commissionCents + amounts.commissionCents,
    }),
    { count: 0, cents: 0, commissionCents: 0 },
  );
}

// As somas do rodapé são de todas as encontradas.
export function therapistListPage(therapists: TherapistSummary[], { q, sort, dir, page }: TherapistListQuery) {
  const term = normalize(q);
  const filtered = therapists.filter((therapist) => !term || normalize(therapist.therapistName).includes(term));
  const compare = (a: TherapistSummary, b: TherapistSummary) =>
    sort === "name" ? compareText(a.therapistName, b.therapistName) : a[sort].cents - b[sort].cents;
  return {
    ...sortAndPage(filtered, compare, dir, page),
    sums: { real: sumAmounts(filtered.map((therapist) => therapist.real)) },
  };
}
