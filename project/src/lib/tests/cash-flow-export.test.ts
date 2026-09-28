import { describe, it, expect } from "vitest";
import {
  cashFlowReport,
  expenseGroupReport,
  expenseReport,
  parseExportFormat,
  type CashFlowReportInput,
  type ExpenseGroupReportInput,
  type ExpenseReportInput,
} from "@/lib/cash-flow-export";
import type { ExpenseCashFlowAmounts } from "@/lib/cash-flow";

function amounts(overrides: Partial<ExpenseCashFlowAmounts> = {}): ExpenseCashFlowAmounts {
  return {
    grossCents: 0,
    partnerShareCents: 0,
    commissionCents: 0,
    salaryCents: 0,
    expenseCents: 0,
    netCents: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------- formato

describe("parseExportFormat", () => {
  it("aceita pdf e xlsx", () => {
    expect(parseExportFormat("pdf")).toBe("pdf");
    expect(parseExportFormat("xlsx")).toBe("xlsx");
  });

  it("recusa outros formatos e a ausência de formato", () => {
    expect(parseExportFormat("csv")).toBeNull();
    expect(parseExportFormat("PDF")).toBeNull();
    expect(parseExportFormat(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------- resumo do caixa

const SEPT = { from: "2026-09-01", to: "2026-09-30" };

function cashFlowInput(overrides: Partial<CashFlowReportInput> = {}): CashFlowReportInput {
  const week1 = amounts({ grossCents: 100000, commissionCents: 30000, expenseCents: 20000, netCents: 50000 });
  const week2 = amounts({ grossCents: 50000, commissionCents: 15000, netCents: 35000 });
  return {
    unitName: "Centro",
    query: { view: "month", date: "2026-09-24" },
    range: SEPT,
    balanceCents: 123456,
    openingBalance: { amountCents: 100000, date: "2026-01-01" },
    summary: {
      buckets: [
        { from: "2026-09-01", to: "2026-09-06", real: week1, forecast: amounts() },
        { from: "2026-09-07", to: "2026-09-07", real: week2, forecast: amounts() },
      ],
      total: {
        real: amounts({ grossCents: 150000, commissionCents: 45000, expenseCents: 20000, netCents: 85000 }),
        forecast: amounts(),
      },
    },
    columns: { partnerShare: false, commission: true, salary: false, expenses: true },
    curve: [
      {
        from: "2026-08-01",
        to: "2026-08-31",
        plannedCents: 60000,
        spentCents: 40000,
        plannedCumulativeCents: 60000,
        spentCumulativeCents: 40000,
      },
      {
        from: "2026-10-01",
        to: "2026-10-31",
        plannedCents: 60000,
        spentCents: null,
        plannedCumulativeCents: 120000,
        spentCumulativeCents: null,
      },
    ],
    costs: {
      totalCents: 65000,
      rows: [
        { kind: "commission", cents: 45000, share: 45000 / 65000 },
        { kind: "group", group: { name: "Aluguel" }, cents: 20000, share: 20000 / 65000 },
      ],
    },
    therapists: {
      rows: [
        {
          therapistId: "665f00000000000000abcde",
          therapistName: "Ana",
          commissionPercent: 30,
          real: { count: 4, cents: 100000, commissionCents: 30000 },
          forecast: { count: 0, cents: 0, commissionCents: 0 },
        },
        {
          therapistId: "665f00000000000000fghij",
          therapistName: "Dono",
          commissionPercent: null,
          real: { count: 2, cents: 50000, commissionCents: 0 },
          forecast: { count: 0, cents: 0, commissionCents: 0 },
        },
      ],
      sums: { real: { count: 6, cents: 150000, commissionCents: 30000 } },
    },
    ...overrides,
  };
}

describe("cashFlowReport", () => {
  it("tem título com a unidade, o período por extenso e o nome do arquivo com o período", () => {
    const report = cashFlowReport(cashFlowInput());
    expect(report.title).toBe("Caixa · Centro");
    expect(report.subtitle).toBe("Setembro de 2026");
    expect(report.fileName).toBe("caixa-2026-09");
  });

  it("no ano, o período é o ano; na semana, o intervalo de dias", () => {
    const year = cashFlowReport(cashFlowInput({ query: { view: "year", date: "2026-09-24" }, range: { from: "2026-01-01", to: "2026-12-31" } }));
    expect(year.subtitle).toBe("2026");
    expect(year.fileName).toBe("caixa-2026");

    const week = cashFlowReport(cashFlowInput({ query: { view: "week", date: "2026-09-24" }, range: { from: "2026-09-21", to: "2026-09-27" } }));
    expect(week.subtitle).toBe("21 de setembro a 27 de setembro de 2026");
    expect(week.fileName).toBe("caixa-2026-09-21-a-2026-09-27");
  });

  it("destaca o saldo em caixa e o saldo inicial com o dia dele", () => {
    expect(cashFlowReport(cashFlowInput()).highlights).toEqual([
      { label: "Saldo em caixa", cents: 123456 },
      { label: "Saldo inicial em 01/01/2026", cents: 100000 },
    ]);
  });

  it("sem saldo inicial, o saldo aparece vazio e o saldo inicial some", () => {
    expect(cashFlowReport(cashFlowInput({ balanceCents: null, openingBalance: null })).highlights).toEqual([
      { label: "Saldo em caixa", cents: null },
    ]);
  });

  it("a tabela do fluxo tem só as deduções existentes, negativas, e o total no rodapé", () => {
    const [flow] = cashFlowReport(cashFlowInput()).tables;
    expect(flow.title).toBe("Fluxo de caixa");
    expect(flow.columns).toEqual([
      { label: "Período", kind: "text" },
      { label: "Bruto", kind: "money" },
      { label: "Comissão", kind: "money" },
      { label: "Despesas", kind: "money" },
      { label: "Líquido", kind: "money" },
    ]);
    expect(flow.rows).toEqual([
      ["01/09 a 06/09", 100000, -30000, -20000, 50000],
      ["07/09", 50000, -15000, 0, 35000],
    ]);
    expect(flow.total).toEqual(["Total", 150000, -45000, -20000, 85000]);
  });

  it("sem nenhuma dedução, a tabela do fluxo tem só o bruto", () => {
    const columns = { partnerShare: false, commission: false, salary: false, expenses: false };
    const [flow] = cashFlowReport(cashFlowInput({ columns })).tables;
    expect(flow.columns).toEqual([
      { label: "Período", kind: "text" },
      { label: "Bruto", kind: "money" },
    ]);
    expect(flow.rows).toEqual([
      ["01/09 a 06/09", 100000],
      ["07/09", 50000],
    ]);
    expect(flow.total).toEqual(["Total", 150000]);
  });

  it("com todas as deduções, segue a ordem da tela: repasse, comissão, salário e despesas", () => {
    const columns = { partnerShare: true, commission: true, salary: true, expenses: true };
    const [flow] = cashFlowReport(cashFlowInput({ columns })).tables;
    expect(flow.columns.map((column) => column.label)).toEqual([
      "Período",
      "Bruto",
      "Repasse",
      "Comissão",
      "Salário e bônus",
      "Despesas",
      "Líquido",
    ]);
  });

  it("na semana, o intervalo é o dia da semana; no ano, o mês com inicial maiúscula", () => {
    const week = cashFlowReport(cashFlowInput({ query: { view: "week", date: "2026-09-24" } })).tables[0];
    expect(week.rows.map((row) => row[0])).toEqual(["Ter., 01/09", "Seg., 07/09"]);

    const year = cashFlowReport(cashFlowInput({ query: { view: "year", date: "2026-09-24" } })).tables[0];
    expect(year.rows.map((row) => row[0])).toEqual(["Setembro", "Setembro"]);
  });

  it("o custo por mês tem planejado e gasto, no mês e acumulados; meses futuros sem gasto", () => {
    const curve = cashFlowReport(cashFlowInput()).tables[1];
    expect(curve.title).toBe("Custo por mês");
    expect(curve.columns).toEqual([
      { label: "Mês", kind: "text" },
      { label: "Planejado", kind: "money" },
      { label: "Gasto", kind: "money" },
      { label: "Planejado acumulado", kind: "money" },
      { label: "Gasto acumulado", kind: "money" },
    ]);
    expect(curve.rows).toEqual([
      ["Agosto", 60000, 40000, 60000, 40000],
      ["Outubro", 60000, null, 120000, null],
    ]);
    expect(curve.total).toBeUndefined();
  });

  it("os gastos por grupo têm o nome, o valor e a fatia, com o total de 100%", () => {
    const costs = cashFlowReport(cashFlowInput()).tables[2];
    expect(costs.title).toBe("Gastos por grupo");
    expect(costs.columns).toEqual([
      { label: "Grupo", kind: "text" },
      { label: "Valor", kind: "money" },
      { label: "%", kind: "percent" },
    ]);
    expect(costs.rows).toEqual([
      ["Comissões", 45000, 45000 / 65000],
      ["Aluguel", 20000, 20000 / 65000],
    ]);
    expect(costs.total).toEqual(["Total", 65000, 1]);
  });

  it("usa os nomes da tela para repasse e salário", () => {
    const costs = cashFlowReport(
      cashFlowInput({
        costs: {
          totalCents: 200,
          rows: [
            { kind: "partner_share", cents: 100, share: 0.5 },
            { kind: "salary", cents: 100, share: 0.5 },
          ],
        },
      }),
    ).tables[2];
    expect(costs.rows.map((row) => row[0])).toEqual(["Repasse", "Salário e bônus"]);
  });

  it("sem gastos, a tabela de gastos por grupo some", () => {
    const report = cashFlowReport(cashFlowInput({ costs: { totalCents: 0, rows: [] } }));
    expect(report.tables.map((table) => table.title)).toEqual(["Fluxo de caixa", "Custo por mês", "Por massagista"]);
  });

  it("por massagista tem código, nome, percentual (vazio sem comissão), quantidade, bruto e comissão", () => {
    const therapists = cashFlowReport(cashFlowInput()).tables[3];
    expect(therapists.title).toBe("Por massagista");
    expect(therapists.columns).toEqual([
      { label: "Código", kind: "text" },
      { label: "Massagista", kind: "text" },
      { label: "% comissão", kind: "percent" },
      { label: "Qtd.", kind: "number" },
      { label: "Bruto", kind: "money" },
      { label: "Comissão", kind: "money" },
    ]);
    expect(therapists.rows).toEqual([
      ["…abcde", "Ana", 0.3, 4, 100000, 30000],
      ["…fghij", "Dono", null, 2, 50000, 0],
    ]);
    expect(therapists.total).toEqual(["Total", null, null, 6, 150000, 30000]);
  });

  it("sem massagistas, a tabela vem vazia e sem total", () => {
    const report = cashFlowReport(
      cashFlowInput({ therapists: { rows: [], sums: { real: { count: 0, cents: 0, commissionCents: 0 } } } }),
    );
    const therapists = report.tables.at(-1)!;
    expect(therapists.rows).toEqual([]);
    expect(therapists.total).toBeUndefined();
  });
});

// ---------------------------------------------------------------- despesas

function expenseInput(overrides: Partial<ExpenseReportInput> = {}): ExpenseReportInput {
  return {
    unitName: "Centro",
    date: "2026-09-24",
    groups: [
      { id: "fixas", name: "Fixas" },
      { id: "insumos", name: "Insumos" },
    ],
    expenses: [
      {
        groupId: "fixas",
        description: "Aluguel",
        amountCents: 300000,
        date: "2026-09-05",
        paid: true,
        series: { kind: "recurring", number: 3, count: 12 },
      },
      { groupId: "insumos", description: "Óleo", amountCents: 8000, date: "2026-09-10", paid: false, series: null },
      {
        groupId: "insumos",
        description: "Maca",
        amountCents: 50000,
        date: "2026-09-20",
        paid: false,
        series: { kind: "installments", number: 2, count: 10 },
      },
    ],
    totalCents: 358000,
    paidCents: 300000,
    ...overrides,
  };
}

describe("expenseReport", () => {
  it("tem título com a unidade, o mês por extenso e o nome do arquivo com o mês", () => {
    const report = expenseReport(expenseInput());
    expect(report.title).toBe("Despesas · Centro");
    expect(report.subtitle).toBe("Setembro de 2026");
    expect(report.fileName).toBe("despesas-2026-09");
  });

  it("destaca o total, o pago e o pendente", () => {
    expect(expenseReport(expenseInput()).highlights).toEqual([
      { label: "Total", cents: 358000 },
      { label: "Pagos", cents: 300000 },
      { label: "Pendentes", cents: 58000 },
    ]);
  });

  it("lista as despesas na ordem recebida, com status, dia, descrição com a série, grupo e valor", () => {
    const [table] = expenseReport(expenseInput()).tables;
    expect(table.title).toBe("Despesas");
    expect(table.columns).toEqual([
      { label: "Status", kind: "text" },
      { label: "Dia", kind: "date" },
      { label: "Descrição", kind: "text" },
      { label: "Grupo", kind: "text" },
      { label: "Valor", kind: "money" },
    ]);
    expect(table.rows).toEqual([
      ["Pago", "2026-09-05", "Aluguel (Mês 3/12)", "Fixas", 300000],
      ["Pendente", "2026-09-10", "Óleo", "Insumos", 8000],
      ["Pendente", "2026-09-20", "Maca (Parcela 2/10)", "Insumos", 50000],
    ]);
    expect(table.total).toEqual(["Total", null, null, null, 358000]);
  });

  it("despesa de grupo que não está na lista fica com o grupo vazio", () => {
    const [table] = expenseReport(
      expenseInput({
        expenses: [{ groupId: "sumiu", description: "X", amountCents: 100, date: "2026-09-01", paid: false, series: null }],
        totalCents: 100,
        paidCents: 0,
      }),
    ).tables;
    expect(table.rows).toEqual([["Pendente", "2026-09-01", "X", null, 100]]);
  });

  it("sem despesas, a tabela vem vazia com o total zerado", () => {
    const [table] = expenseReport(expenseInput({ expenses: [], totalCents: 0, paidCents: 0 })).tables;
    expect(table.rows).toEqual([]);
    expect(table.total).toEqual(["Total", null, null, null, 0]);
  });
});

// ---------------------------------------------------------------- planejamento

function groupInput(overrides: Partial<ExpenseGroupReportInput> = {}): ExpenseGroupReportInput {
  return {
    unitName: "Centro",
    query: { view: "month", date: "2026-09-24" },
    groups: [
      { name: "Fixas", limitCents: 300000, totalCents: 350000, paidCents: 300000, overLimit: true },
      { name: "Insumos", limitCents: 100000, totalCents: 58000, paidCents: 0, overLimit: false },
      { name: "Outros", limitCents: null, totalCents: 2000, paidCents: 2000, overLimit: false },
    ],
    sums: { totalCents: 410000, paidCents: 302000, limitCents: 400000 },
    ...overrides,
  };
}

describe("expenseGroupReport", () => {
  it("no mês, tem título com a unidade, o mês por extenso e o nome do arquivo com o mês", () => {
    const report = expenseGroupReport(groupInput());
    expect(report.title).toBe("Planejamento · Centro");
    expect(report.subtitle).toBe("Setembro de 2026");
    expect(report.fileName).toBe("planejamento-2026-09");
  });

  it("no ano, o subtítulo e o nome do arquivo são o ano", () => {
    const report = expenseGroupReport(groupInput({ query: { view: "year", date: "2026-09-24" } }));
    expect(report.subtitle).toBe("2026");
    expect(report.fileName).toBe("planejamento-2026");
  });

  it("destaca o pago, o lançado e o planejado, na ordem da tela", () => {
    expect(expenseGroupReport(groupInput()).highlights).toEqual([
      { label: "Pago", cents: 302000 },
      { label: "Lançado", cents: 410000 },
      { label: "Planejado", cents: 400000 },
    ]);
  });

  it("lista os grupos na ordem recebida, com lançado, pago, limite e quanto passou dele", () => {
    const [table] = expenseGroupReport(groupInput()).tables;
    expect(table.title).toBe("Grupos");
    expect(table.columns).toEqual([
      { label: "Grupo", kind: "text" },
      { label: "Lançado", kind: "money" },
      { label: "Pago", kind: "money" },
      { label: "Limite por mês", kind: "money" },
      { label: "Acima do limite", kind: "money" },
    ]);
    expect(table.rows).toEqual([
      ["Fixas", 350000, 300000, 300000, 50000],
      ["Insumos", 58000, 0, 100000, null],
      ["Outros", 2000, 2000, null, null],
    ]);
    expect(table.total).toEqual(["Total", 410000, 302000, 400000, null]);
  });

  it("no ano, a coluna do limite é o limite no ano", () => {
    const [table] = expenseGroupReport(groupInput({ query: { view: "year", date: "2026-09-24" } })).tables;
    expect(table.columns[3]).toEqual({ label: "Limite no ano", kind: "money" });
  });

  it("sem grupos, a tabela vem vazia com os totais zerados", () => {
    const [table] = expenseGroupReport(
      groupInput({ groups: [], sums: { totalCents: 0, paidCents: 0, limitCents: 0 } }),
    ).tables;
    expect(table.rows).toEqual([]);
    expect(table.total).toEqual(["Total", 0, 0, 0, null]);
  });
});
