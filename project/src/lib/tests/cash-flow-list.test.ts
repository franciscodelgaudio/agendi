import { describe, it, expect } from "vitest";
import {
  CASH_FLOW_PAGE_SIZE,
  expenseGroupListPage,
  expenseListPage,
  parseExpenseGroupListQuery,
  parseExpenseListQuery,
  parseTherapistListQuery,
  therapistListPage,
  type ExpenseListItem,
} from "@/lib/cash-flow-list";
import type { ExpenseGroupSummary } from "@/lib/expense";
import type { TherapistSummary } from "@/lib/cash-flow";

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("CASH_FLOW_PAGE_SIZE", () => {
  it("mostra 20 linhas por página", () => {
    expect(CASH_FLOW_PAGE_SIZE).toBe(20);
  });
});

// ---------------------------------------------------------------- despesas

const EXPENSE_BASE = { q: "", group: "", status: "", sort: "date", dir: "asc", page: 1 } as const;

function expense(overrides: Partial<ExpenseListItem> & { id: string }): ExpenseListItem {
  return { groupId: "g1", description: overrides.id, amountCents: 1000, date: "2026-09-01", paid: false, ...overrides };
}

// Na ordem em que a página busca: por dia e, no mesmo dia, pela criação.
const ALUGUEL = expense({ id: "aluguel", description: "Aluguel", amountCents: 300000, date: "2026-09-05", paid: true, groupId: "fixas" });
const LUZ = expense({ id: "luz", description: "Conta de luz", amountCents: 25000, date: "2026-09-10", groupId: "fixas" });
const OLEO = expense({ id: "oleo", description: "óleo de massagem", amountCents: 8000, date: "2026-09-10", paid: true, groupId: "insumos" });
const TOALHAS = expense({ id: "toalhas", description: "Toalhas", amountCents: 12000, date: "2026-09-20", groupId: "insumos" });
const EXPENSES = [ALUGUEL, LUZ, OLEO, TOALHAS];

describe("parseExpenseListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena por dia crescente na página 1", () => {
    expect(parseExpenseListQuery({})).toEqual(EXPENSE_BASE);
  });

  it("lê busca, grupo, status, ordenação, direção e página válidos", () => {
    expect(
      parseExpenseListQuery({ q: " luz ", group: "fixas", status: "paid", sort: "amount", dir: "desc", page: "2" }),
    ).toEqual({ q: "luz", group: "fixas", status: "paid", sort: "amount", dir: "desc", page: 2 });
  });

  it.each(["date", "description", "amount"])("aceita ordenar por %s", (sort) => {
    expect(parseExpenseListQuery({ sort }).sort).toBe(sort);
  });

  it.each(["paid", "pending"])("aceita o status %s", (status) => {
    expect(parseExpenseListQuery({ status }).status).toBe(status);
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseExpenseListQuery({ group: ["fixas", "insumos"], status: ["pending", "paid"] })).toEqual(
      expect.objectContaining({ group: "fixas", status: "pending" }),
    );
  });

  it("ignora valores inválidos", () => {
    expect(parseExpenseListQuery({ sort: "groupId", dir: "up", status: "late", page: "0" })).toEqual(EXPENSE_BASE);
  });

  it("ignora os parâmetros da navegação do caixa", () => {
    expect(parseExpenseListQuery({ view: "month", date: "2026-09-01" })).toEqual(EXPENSE_BASE);
  });
});

describe("expenseListPage", () => {
  it("sem busca nem filtros, mantém a ordem por dia e soma o total e o pago de todas", () => {
    expect(expenseListPage(EXPENSES, EXPENSE_BASE)).toEqual({
      rows: EXPENSES,
      total: 4,
      totalCents: 345000,
      paidCents: 308000,
    });
  });

  it("ordena por dia decrescente; no mesmo dia, mantém a ordem de criação", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, dir: "desc" }).rows)).toEqual([
      "toalhas",
      "luz",
      "oleo",
      "aluguel",
    ]);
  });

  it("ordena pela descrição sem diferenciar maiúsculas nem acentos", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, sort: "description" }).rows)).toEqual([
      "aluguel",
      "luz",
      "oleo",
      "toalhas",
    ]);
  });

  it("ordena pelo valor", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, sort: "amount", dir: "desc" }).rows)).toEqual([
      "aluguel",
      "luz",
      "toalhas",
      "oleo",
    ]);
  });

  it("busca na descrição sem diferenciar maiúsculas nem acentos", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, q: "OLEO" }).rows)).toEqual(["oleo"]);
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, q: "conta" }).rows)).toEqual(["luz"]);
  });

  it("filtra por grupo", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, group: "insumos" }).rows)).toEqual(["oleo", "toalhas"]);
  });

  it("grupo inexistente não mostra nada", () => {
    expect(expenseListPage(EXPENSES, { ...EXPENSE_BASE, group: "outro" })).toEqual({
      rows: [],
      total: 0,
      totalCents: 0,
      paidCents: 0,
    });
  });

  it("filtra pagas e pendentes", () => {
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, status: "paid" }).rows)).toEqual(["aluguel", "oleo"]);
    expect(ids(expenseListPage(EXPENSES, { ...EXPENSE_BASE, status: "pending" }).rows)).toEqual(["luz", "toalhas"]);
  });

  it("combina busca e filtros; os totais somam só as que passaram, de todas as páginas", () => {
    expect(expenseListPage(EXPENSES, { ...EXPENSE_BASE, group: "insumos", status: "pending", q: "toa" })).toEqual({
      rows: [TOALHAS],
      total: 1,
      totalCents: 12000,
      paidCents: 0,
    });
  });

  it("pagina depois de filtrar e ordenar; o total e as somas são de todas as páginas", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      expense({ id: `e${String(i).padStart(2, "0")}`, amountCents: 100, paid: i < 5 }),
    );
    const page1 = expenseListPage(many, EXPENSE_BASE);
    const page3 = expenseListPage(many, { ...EXPENSE_BASE, page: 3 });
    expect(ids(page1.rows)).toEqual(ids(many.slice(0, 20)));
    expect(page3).toEqual({ rows: many.slice(40), total: 45, totalCents: 4500, paidCents: 500 });
  });

  it("página além da última devolve lista vazia com o total e as somas", () => {
    expect(expenseListPage(EXPENSES, { ...EXPENSE_BASE, page: 2 })).toEqual({
      rows: [],
      total: 4,
      totalCents: 345000,
      paidCents: 308000,
    });
  });

  it("não altera a lista recebida", () => {
    const input = [...EXPENSES];
    expenseListPage(input, { ...EXPENSE_BASE, sort: "amount", dir: "desc" });
    expect(input).toEqual(EXPENSES);
  });
});

// ------------------------------------------------------------------ grupos

const GROUP_BASE = { q: "", limit: "", sort: "name", dir: "asc", page: 1 } as const;

function group(
  overrides: Partial<ExpenseGroupSummary> & { id: string },
): ExpenseGroupSummary {
  const monthlyLimitCents = overrides.monthlyLimitCents ?? null;
  return { name: overrides.id, monthlyLimitCents, limitCents: monthlyLimitCents, totalCents: 0, paidCents: 0, overLimit: false, ...overrides };
}

// Na ordem do resumo: por nome.
const ALIMENTACAO = group({ id: "alimentacao", name: "Alimentação", monthlyLimitCents: 50000, totalCents: 60000, paidCents: 10000, overLimit: true });
const FIXAS = group({ id: "fixas", name: "Fixas", totalCents: 325000, paidCents: 300000 });
const INSUMOS = group({ id: "insumos", name: "insumos", monthlyLimitCents: 30000, totalCents: 20000, paidCents: 8000 });
const MARKETING = group({ id: "marketing", name: "Marketing", monthlyLimitCents: 10000 });
const GROUPS = [ALIMENTACAO, FIXAS, INSUMOS, MARKETING];

describe("parseExpenseGroupListQuery", () => {
  it("sem parâmetros, não tem busca nem filtro e ordena por nome crescente na página 1", () => {
    expect(parseExpenseGroupListQuery({})).toEqual(GROUP_BASE);
  });

  it("lê busca, filtro de limite, ordenação, direção e página válidos", () => {
    expect(parseExpenseGroupListQuery({ q: " ins ", limit: "over", sort: "total", dir: "desc", page: "4" })).toEqual({
      q: "ins",
      limit: "over",
      sort: "total",
      dir: "desc",
      page: 4,
    });
  });

  it.each(["name", "total", "paid"])("aceita ordenar por %s", (sort) => {
    expect(parseExpenseGroupListQuery({ sort }).sort).toBe(sort);
  });

  it.each(["over", "within", "none"])("aceita o filtro de limite %s", (limit) => {
    expect(parseExpenseGroupListQuery({ limit }).limit).toBe(limit);
  });

  it("ignora valores inválidos", () => {
    expect(parseExpenseGroupListQuery({ sort: "icon", dir: "up", limit: "any", page: "-1" })).toEqual(GROUP_BASE);
  });
});

describe("expenseGroupListPage", () => {
  it("sem busca nem filtro, mantém a ordem por nome", () => {
    expect(expenseGroupListPage(GROUPS, GROUP_BASE)).toEqual({
      rows: GROUPS,
      total: 4,
      sums: { totalCents: 405000, paidCents: 318000, limitCents: 90000 },
    });
  });

  it("ordena por nome decrescente", () => {
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, dir: "desc" }).rows)).toEqual([
      "marketing",
      "insumos",
      "fixas",
      "alimentacao",
    ]);
  });

  it("ordena pelo lançado e pelo pago; empates mantêm a ordem por nome", () => {
    const zero = group({ id: "zero", name: "Zero" });
    expect(ids(expenseGroupListPage([...GROUPS, zero], { ...GROUP_BASE, sort: "total" }).rows)).toEqual([
      "marketing",
      "zero",
      "insumos",
      "alimentacao",
      "fixas",
    ]);
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, sort: "paid", dir: "desc" }).rows)).toEqual([
      "fixas",
      "alimentacao",
      "insumos",
      "marketing",
    ]);
  });

  it("busca no nome sem diferenciar maiúsculas nem acentos", () => {
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, q: "ALIMENTACAO" }).rows)).toEqual(["alimentacao"]);
  });

  it("filtra acima do limite, dentro do limite e sem limite", () => {
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, limit: "over" }).rows)).toEqual(["alimentacao"]);
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, limit: "within" }).rows)).toEqual(["insumos", "marketing"]);
    expect(ids(expenseGroupListPage(GROUPS, { ...GROUP_BASE, limit: "none" }).rows)).toEqual(["fixas"]);
  });

  it("combina busca e filtro", () => {
    expect(expenseGroupListPage(GROUPS, { ...GROUP_BASE, q: "ins", limit: "within" })).toEqual({
      rows: [INSUMOS],
      total: 1,
      sums: { totalCents: 20000, paidCents: 8000, limitCents: 30000 },
    });
  });

  it("pagina depois de filtrar e ordenar; o total é o de todas as páginas", () => {
    const many = Array.from({ length: 25 }, (_, i) => group({ id: `g${String(i).padStart(2, "0")}` }));
    expect(ids(expenseGroupListPage(many, GROUP_BASE).rows)).toEqual(ids(many.slice(0, 20)));
    expect(expenseGroupListPage(many, { ...GROUP_BASE, page: 2 })).toEqual({
      rows: many.slice(20),
      total: 25,
      sums: { totalCents: 0, paidCents: 0, limitCents: 0 },
    });
  });

  it("soma lançado, pago e planejado só dos filtrados; grupo sem limite não entra no planejado", () => {
    expect(expenseGroupListPage(GROUPS, { ...GROUP_BASE, limit: "within" }).sums).toEqual({
      totalCents: 20000,
      paidCents: 8000,
      limitCents: 40000,
    });
    expect(expenseGroupListPage(GROUPS, { ...GROUP_BASE, limit: "none" }).sums).toEqual({
      totalCents: 325000,
      paidCents: 300000,
      limitCents: 0,
    });
  });

  it("as somas são de todas as páginas, não só da exibida", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      group({ id: `g${String(i).padStart(2, "0")}`, monthlyLimitCents: 1000, totalCents: 500, paidCents: 100 }),
    );
    expect(expenseGroupListPage(many, { ...GROUP_BASE, page: 2 }).sums).toEqual({
      totalCents: 10500,
      paidCents: 2100,
      limitCents: 21000,
    });
  });

  it("não altera a lista recebida", () => {
    const input = [...GROUPS];
    expenseGroupListPage(input, { ...GROUP_BASE, dir: "desc" });
    expect(input).toEqual(GROUPS);
  });
});

// ------------------------------------------------------------- massagistas

const THERAPIST_BASE = { q: "", sort: "real", dir: "desc", page: 1 } as const;

function therapist(
  id: string,
  therapistName: string,
  real: number,
  forecast: number,
  commissionPercent: number | null = null,
): TherapistSummary {
  const amounts = (cents: number) => ({
    count: cents / 1000,
    cents,
    commissionCents: Math.round((cents * (commissionPercent ?? 0)) / 100),
  });
  return { therapistId: id, therapistName, commissionPercent, real: amounts(real), forecast: amounts(forecast) };
}

// Na ordem do resumo: pelo previsto, decrescente (diferente da ordem pelo real).
const BIA = therapist("bia", "Bia", 20000, 50000, 40);
const ANA_T = therapist("ana", "Ana", 30000, 40000);
const CAIO = therapist("caio", "caio", 10000, 10000, 50);
const THERAPISTS = [BIA, ANA_T, CAIO];

const therapistIds = (rows: TherapistSummary[]) => rows.map((row) => row.therapistId);

describe("parseTherapistListQuery", () => {
  it("sem parâmetros, ordena pelo bruto real decrescente na página 1", () => {
    expect(parseTherapistListQuery({})).toEqual(THERAPIST_BASE);
  });

  it("lê busca, ordenação, direção e página válidos", () => {
    expect(parseTherapistListQuery({ q: " ana ", sort: "name", dir: "asc", page: "2" })).toEqual({
      q: "ana",
      sort: "name",
      dir: "asc",
      page: 2,
    });
  });

  it.each(["name", "real"])("aceita ordenar por %s", (sort) => {
    expect(parseTherapistListQuery({ sort, dir: "asc" }).sort).toBe(sort);
  });

  it("não ordena pelo previsto", () => {
    expect(parseTherapistListQuery({ sort: "forecast" }).sort).toBe("real");
  });

  it("sem direção, o nome ordena crescente e os valores, decrescente", () => {
    expect(parseTherapistListQuery({ sort: "name" }).dir).toBe("asc");
    expect(parseTherapistListQuery({ sort: "real" }).dir).toBe("desc");
  });

  it("ignora valores inválidos", () => {
    expect(parseTherapistListQuery({ sort: "commission", dir: "up", page: "1.5" })).toEqual(THERAPIST_BASE);
  });

  it("ignora os parâmetros da navegação do caixa", () => {
    expect(parseTherapistListQuery({ view: "week", date: "2026-09-01" })).toEqual(THERAPIST_BASE);
  });
});

describe("therapistListPage", () => {
  const sums = (real: [number, number, number]) => ({
    real: { count: real[0], cents: real[1], commissionCents: real[2] },
  });

  it("sem busca, ordena pelo bruto real decrescente e soma o real de todas", () => {
    expect(therapistListPage(THERAPISTS, THERAPIST_BASE)).toEqual({
      rows: [ANA_T, BIA, CAIO],
      total: 3,
      sums: sums([60, 60000, 13000]),
    });
  });

  it("ordena pelo nome sem diferenciar maiúsculas", () => {
    expect(therapistIds(therapistListPage(THERAPISTS, { ...THERAPIST_BASE, sort: "name", dir: "asc" }).rows)).toEqual([
      "ana",
      "bia",
      "caio",
    ]);
  });

  it("ordena pelo bruto real", () => {
    expect(therapistIds(therapistListPage(THERAPISTS, { ...THERAPIST_BASE, sort: "real" }).rows)).toEqual([
      "ana",
      "bia",
      "caio",
    ]);
    expect(
      therapistIds(therapistListPage(THERAPISTS, { ...THERAPIST_BASE, sort: "real", dir: "asc" }).rows),
    ).toEqual(["caio", "bia", "ana"]);
  });

  it("busca no nome sem diferenciar maiúsculas nem acentos; as somas são só das encontradas", () => {
    const joao = therapist("joao", "João", 1000, 2000);
    expect(therapistListPage([...THERAPISTS, joao], { ...THERAPIST_BASE, q: "JOAO" })).toEqual({
      rows: [joao],
      total: 1,
      sums: sums([1, 1000, 0]),
    });
  });

  it("pagina; o total e as somas são de todas as páginas", () => {
    const many = Array.from({ length: 21 }, (_, i) => therapist(`t${String(i).padStart(2, "0")}`, `T${i}`, 1000, 1000));
    const page2 = therapistListPage(many, { ...THERAPIST_BASE, page: 2 });
    expect(therapistIds(therapistListPage(many, THERAPIST_BASE).rows)).toEqual(therapistIds(many.slice(0, 20)));
    expect(page2).toEqual({ rows: many.slice(20), total: 21, sums: sums([21, 21000, 0]) });
  });

  it("não altera a lista recebida", () => {
    const input = [...THERAPISTS];
    therapistListPage(input, { ...THERAPIST_BASE, sort: "name", dir: "asc" });
    expect(input).toEqual(THERAPISTS);
  });
});
