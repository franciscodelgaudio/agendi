import type {
  CashFlowQuery,
  CashFlowView,
  CostCurvePoint,
  CostRow,
  DayRange,
  ExpenseCashFlowAmounts,
  ExpenseCashFlowSummary,
  TherapistAmounts,
  TherapistSummary,
} from "@/lib/cash-flow";
import type { OpeningBalance } from "@/lib/opening-balance";
import { recordCode } from "@/lib/record-code";

export const EXPORT_FORMATS = ["pdf", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// money: centavos; percent: fração de 0 a 1; date: dia do calendário ("2026-09-24").
export type ReportColumnKind = "text" | "money" | "number" | "percent" | "date";
export type ReportColumn = { label: string; kind: ReportColumnKind };
// null = célula vazia.
export type ReportValue = string | number | null;
export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportValue[][]; total?: ReportValue[] };
// Conteúdo de um relatório, desenhado igual em PDF e XLSX. fileName vem sem extensão.
export type Report = {
  title: string;
  subtitle: string;
  fileName: string;
  highlights: { label: string; cents: number | null }[];
  tables: ReportTable[];
};

export function parseExportFormat(value: string | undefined): ExportFormat | null {
  return EXPORT_FORMATS.includes(value as ExportFormat) ? (value as ExportFormat) : null;
}

// As datas são dias do calendário, então são formatadas em UTC para não deslocar.
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fullDayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthYearFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const longDayMonthFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
const longDayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function periodLabel({ view, date }: CashFlowQuery, range: DayRange) {
  if (view === "year") return date.slice(0, 4);
  if (view === "month") return capitalize(monthYearFormat.format(toDate(date)));
  return `${longDayMonthFormat.format(toDate(range.from))} a ${longDayFormat.format(toDate(range.to))}`;
}

function periodFileSuffix({ view, date }: CashFlowQuery, range: DayRange) {
  if (view === "year") return date.slice(0, 4);
  if (view === "month") return date.slice(0, 7);
  return `${range.from}-a-${range.to}`;
}

function bucketLabel(view: CashFlowView, { from, to }: DayRange) {
  if (view === "week") return capitalize(weekdayFormat.format(toDate(from)));
  if (view === "year") return capitalize(monthFormat.format(toDate(from)));
  return from === to
    ? dayMonthFormat.format(toDate(from))
    : `${dayMonthFormat.format(toDate(from))} a ${dayMonthFormat.format(toDate(to))}`;
}

const money = (label: string): ReportColumn => ({ label, kind: "money" });
const text = (label: string): ReportColumn => ({ label, kind: "text" });

export type CashFlowReportInput = {
  unitName: string;
  query: CashFlowQuery;
  range: DayRange;
  balanceCents: number | null;
  openingBalance: OpeningBalance | null;
  summary: ExpenseCashFlowSummary;
  // Deduções com colunas na tela; sem nenhuma, só o bruto.
  columns: { partnerShare: boolean; commission: boolean; salary: boolean; expenses: boolean };
  curve: CostCurvePoint[];
  costs: { totalCents: number; rows: CostRow<{ name: string }>[] };
  // Todas as encontradas (sem paginar), na ordem da tela.
  therapists: { rows: TherapistSummary[]; sums: { real: TherapistAmounts } };
};

const STAFF_COST_NAMES = { partner_share: "Repasse", commission: "Comissões", salary: "Salário e bônus" } as const;

function flowTable(view: CashFlowView, summary: ExpenseCashFlowSummary, columns: CashFlowReportInput["columns"]): ReportTable {
  const deductions = [
    { on: columns.partnerShare, label: "Repasse", key: "partnerShareCents" },
    { on: columns.commission, label: "Comissão", key: "commissionCents" },
    { on: columns.salary, label: "Salário e bônus", key: "salaryCents" },
    { on: columns.expenses, label: "Despesas", key: "expenseCents" },
  ].filter((deduction) => deduction.on) as { label: string; key: keyof ExpenseCashFlowAmounts }[];
  const detailed = deductions.length > 0;
  const values = (amounts: ExpenseCashFlowAmounts) => [
    amounts.grossCents,
    // 0 - 0 daria -0.
    ...deductions.map(({ key }) => (amounts[key] ? -amounts[key] : 0)),
    ...(detailed ? [amounts.netCents] : []),
  ];
  return {
    title: "Fluxo de caixa",
    columns: [
      text("Período"),
      money("Bruto"),
      ...deductions.map(({ label }) => money(label)),
      ...(detailed ? [money("Líquido")] : []),
    ],
    rows: summary.buckets.map((bucket) => [bucketLabel(view, bucket), ...values(bucket.real)]),
    total: ["Total", ...values(summary.total.real)],
  };
}

export function cashFlowReport(input: CashFlowReportInput): Report {
  const { query, range, openingBalance, costs, therapists } = input;
  const tables: ReportTable[] = [
    flowTable(query.view, input.summary, input.columns),
    {
      title: "Custo por mês",
      columns: [
        text("Mês"),
        money("Planejado"),
        money("Gasto"),
        money("Planejado acumulado"),
        money("Gasto acumulado"),
      ],
      rows: input.curve.map((point) => [
        bucketLabel("year", point),
        point.plannedCents,
        point.spentCents,
        point.plannedCumulativeCents,
        point.spentCumulativeCents,
      ]),
    },
  ];
  if (costs.rows.length > 0) {
    tables.push({
      title: "Gastos por grupo",
      columns: [text("Grupo"), money("Valor"), { label: "%", kind: "percent" }],
      rows: costs.rows.map((row) => [
        row.kind === "group" ? row.group.name : STAFF_COST_NAMES[row.kind],
        row.cents,
        row.share,
      ]),
      total: ["Total", costs.totalCents, 1],
    });
  }
  const amountValues = ({ count, cents, commissionCents }: TherapistAmounts) => [count, cents, commissionCents];
  tables.push({
    title: "Por massagista",
    columns: [
      text("Código"),
      text("Massagista"),
      { label: "% comissão", kind: "percent" },
      { label: "Qtd.", kind: "number" },
      money("Bruto"),
      money("Comissão"),
    ],
    rows: therapists.rows.map((therapist) => [
      recordCode(therapist.therapistId),
      therapist.therapistName,
      therapist.commissionPercent === null ? null : therapist.commissionPercent / 100,
      ...amountValues(therapist.real),
    ]),
    ...(therapists.rows.length > 0 && { total: ["Total", null, null, ...amountValues(therapists.sums.real)] }),
  });

  return {
    title: `Caixa · ${input.unitName}`,
    subtitle: periodLabel(query, range),
    fileName: `caixa-${periodFileSuffix(query, range)}`,
    highlights: [
      { label: "Saldo em caixa", cents: input.balanceCents },
      ...(openingBalance
        ? [{ label: `Saldo inicial em ${fullDayFormat.format(toDate(openingBalance.date))}`, cents: openingBalance.amountCents }]
        : []),
    ],
    tables,
  };
}

export type ExpenseReportInput = {
  unitName: string;
  // Qualquer dia do mês exibido.
  date: string;
  groups: { id: string; name: string }[];
  // Todas as filtradas (sem paginar), na ordem da tela.
  expenses: {
    groupId: string;
    description: string;
    amountCents: number;
    date: string;
    paid: boolean;
    series: { kind: "installments" | "recurring"; number: number; count: number } | null;
  }[];
  totalCents: number;
  paidCents: number;
};

export function expenseReport({ unitName, date, groups, expenses, totalCents, paidCents }: ExpenseReportInput): Report {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  return {
    title: `Despesas · ${unitName}`,
    subtitle: capitalize(monthYearFormat.format(toDate(date))),
    fileName: `despesas-${date.slice(0, 7)}`,
    highlights: [
      { label: "Total", cents: totalCents },
      { label: "Pagos", cents: paidCents },
      { label: "Pendentes", cents: totalCents - paidCents },
    ],
    tables: [
      {
        title: "Despesas",
        columns: [text("Status"), { label: "Dia", kind: "date" }, text("Descrição"), text("Grupo"), money("Valor")],
        rows: expenses.map((expense) => [
          expense.paid ? "Pago" : "Pendente",
          expense.date,
          expense.series
            ? `${expense.description} (${expense.series.kind === "installments" ? "Parcela" : "Mês"} ${expense.series.number}/${expense.series.count})`
            : expense.description,
          groupNames.get(expense.groupId) ?? null,
          expense.amountCents,
        ]),
        total: ["Total", null, null, null, totalCents],
      },
    ],
  };
}

export type ExpenseGroupReportInput = {
  unitName: string;
  // O limite é mensal: no ano, vale 12 vezes.
  query: { view: "month" | "year"; date: string };
  // Todos os filtrados (sem paginar), na ordem da tela.
  groups: { name: string; limitCents: number | null; totalCents: number; paidCents: number; overLimit: boolean }[];
  sums: { totalCents: number; paidCents: number; limitCents: number };
};

export function expenseGroupReport({ unitName, query, groups, sums }: ExpenseGroupReportInput): Report {
  const range = { from: query.date, to: query.date };
  return {
    title: `Planejamento · ${unitName}`,
    subtitle: periodLabel(query, range),
    fileName: `planejamento-${periodFileSuffix(query, range)}`,
    highlights: [
      { label: "Pago", cents: sums.paidCents },
      { label: "Lançado", cents: sums.totalCents },
      { label: "Planejado", cents: sums.limitCents },
    ],
    tables: [
      {
        title: "Grupos",
        columns: [
          text("Grupo"),
          money("Lançado"),
          money("Pago"),
          money(query.view === "year" ? "Limite no ano" : "Limite por mês"),
          money("Acima do limite"),
        ],
        rows: groups.map((group) => [
          group.name,
          group.totalCents,
          group.paidCents,
          group.limitCents,
          group.overLimit && group.limitCents !== null ? group.totalCents - group.limitCents : null,
        ]),
        total: ["Total", sums.totalCents, sums.paidCents, sums.limitCents, null],
      },
    ],
  };
}
