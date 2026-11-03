import { parseExportFormat, type ExportFormat, type Report } from "@/service/_shared/report";
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access";
import type { AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { netCents, passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement";

export { parseExportFormat } from "@/service/_shared/report";

export type StatementReportData = {
  name: string;
  partnerName: string | null;
  unitName: string | null;
  from: string | null;
  to: string;
  closedOn: string;
  paidOn: string | null;
  grossCents: number;
  shareBps: number;
  totalCents: number | null;
  receivables: { day: string; name: string; valueCents: number }[];
};

const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function dayLabel(day: string) {
  return day.split("-").reverse().join("/");
}

function periodLabel({ from, to }: Pick<StatementReportData, "from" | "to">) {
  if (!from) return `Até ${dayLabel(to)}`;
  return from === to ? dayLabel(to) : `${dayLabel(from)} a ${dayLabel(to)}`;
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function statementReport(statement: StatementReportData): Report {
  const { grossCents, shareBps } = statement;
  return {
    title: statement.name,
    subtitle: ["Fechamento", statement.partnerName, statement.unitName].filter(Boolean).join(" · "),
    fileName: `fechamento-${slug(statement.name) || statement.to}`,
    details: [
      { label: "Período", value: periodLabel(statement) },
      { label: "Fechado em", value: dayLabel(statement.closedOn) },
      { label: "Situação", value: statement.paidOn ? `Pago em ${dayLabel(statement.paidOn)}` : "Aguardando pagamento" },
      { label: "Atendimentos", value: String(statement.receivables.length) },
    ],
    highlights: [
      { label: "Bruto", cents: grossCents },
      { label: `Parte do parceiro (${percentFormat.format(shareBps / 100)}%)`, cents: passOnCents(grossCents, shareBps) },
      { label: "Você recebe", cents: statement.totalCents ?? netCents(grossCents, shareBps) },
    ],
    tables: [
      {
        title: "Atendimentos",
        columns: [
          { label: "Dia", kind: "date" },
          { label: "Atendimento", kind: "text" },
          { label: "Valor", kind: "money" },
        ],
        rows: statement.receivables.map((receivable) => [receivable.day, receivable.name, receivable.valueCents]),
        total: [null, "Total", grossCents],
      },
    ],
  };
}

export type StatementReportError = AccessError | "invalid_format" | "statement_not_found";

export type StatementReportResult =
  | { ok: true; format: ExportFormat; report: Report }
  | { ok: false; error: StatementReportError };

export async function statementReportFor(
  input: { format: string | null | undefined },
  statementId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { findStatement: (statementId: string) => Promise<StatementReportData | null> },
): Promise<StatementReportResult> {
  if (!ctx.actor) return { ok: false, error: "workspace_not_found" };
  const pages = visiblePages(ctx.actor);
  if (!pages.workspace.includes("cash_flow") && !pages.unit.includes("cash_flow")) return { ok: false, error: "forbidden" };

  const format = parseExportFormat(input.format);
  if (!format) return { ok: false, error: "invalid_format" };
  if (!statementId) return { ok: false, error: "statement_not_found" };

  const statement = await deps.findStatement(statementId);
  if (!statement) return { ok: false, error: "statement_not_found" };
  return { ok: true, format, report: statementReport(statement) };
}
