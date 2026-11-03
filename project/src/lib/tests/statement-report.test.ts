import { describe, it, expect, vi } from "vitest";
import {
  parseExportFormat,
  statementReport,
  statementReportFor,
  type StatementReportData,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement-report";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { ADMIN } from "@/lib/tests/actors";

const STATEMENT_ID = "64b7f0c2a1b2c3d4e5f60900";

const STATEMENT: StatementReportData = {
  name: "Outubro 2026",
  partnerName: "Clínica Bem-Estar",
  unitName: "Unidade Centro",
  from: "2026-10-01",
  to: "2026-10-31",
  closedOn: "2026-11-02",
  paidOn: null,
  grossCents: 280_000,
  shareBps: 3000,
  totalCents: null,
  receivables: [
    { day: "2026-10-03", name: "Massagem · Ana", valueCents: 150_000 },
    { day: "2026-10-20", name: "Drenagem · Bia", valueCents: 130_000 },
  ],
};

function withPages(pages: { workspace?: string[]; unit?: string[] }): Actor {
  return { admin: false, permissions: [], pages: { workspace: pages.workspace ?? [], unit: pages.unit ?? [] } };
}

describe("parseExportFormat", () => {
  it("aceita pdf e xlsx", () => {
    expect(parseExportFormat("pdf")).toBe("pdf");
    expect(parseExportFormat("xlsx")).toBe("xlsx");
  });

  it("recusa qualquer outro valor", () => {
    expect(parseExportFormat("csv")).toBeNull();
    expect(parseExportFormat("")).toBeNull();
    expect(parseExportFormat(null)).toBeNull();
    expect(parseExportFormat(undefined)).toBeNull();
  });
});

describe("statementReport", () => {
  it("monta o relatório do fechamento com resumo, valores e atendimentos", () => {
    expect(statementReport(STATEMENT)).toEqual({
      title: "Outubro 2026",
      subtitle: "Fechamento · Clínica Bem-Estar · Unidade Centro",
      fileName: "fechamento-outubro-2026",
      details: [
        { label: "Período", value: "01/10/2026 a 31/10/2026" },
        { label: "Fechado em", value: "02/11/2026" },
        { label: "Situação", value: "Aguardando pagamento" },
        { label: "Atendimentos", value: "2" },
      ],
      highlights: [
        { label: "Bruto", cents: 280_000 },
        { label: "Parte do parceiro (30%)", cents: 84_000 },
        { label: "Você recebe", cents: 196_000 },
      ],
      tables: [
        {
          title: "Atendimentos",
          columns: [
            { label: "Dia", kind: "date" },
            { label: "Atendimento", kind: "text" },
            { label: "Valor", kind: "money" },
          ],
          rows: [
            ["2026-10-03", "Massagem · Ana", 150_000],
            ["2026-10-20", "Drenagem · Bia", 130_000],
          ],
          total: [null, "Total", 280_000],
        },
      ],
    });
  });

  it("mantém os atendimentos na ordem em que chegam", () => {
    const receivables = [...STATEMENT.receivables].reverse();
    const [table] = statementReport({ ...STATEMENT, receivables }).tables;
    expect(table.rows.map((row) => row[1])).toEqual(["Drenagem · Bia", "Massagem · Ana"]);
  });

  it("fechamento pago mostra o dia do pagamento e o valor da entrada na carteira", () => {
    const report = statementReport({ ...STATEMENT, paidOn: "2026-11-05", totalCents: 195_000 });
    expect(report.details).toContainEqual({ label: "Situação", value: "Pago em 05/11/2026" });
    expect(report.highlights).toContainEqual({ label: "Você recebe", cents: 195_000 });
  });

  it("período sem início é tudo até o fim", () => {
    const report = statementReport({ ...STATEMENT, from: null });
    expect(report.details).toContainEqual({ label: "Período", value: "Até 31/10/2026" });
  });

  it("período de um dia só mostra o dia", () => {
    const report = statementReport({ ...STATEMENT, from: "2026-10-31" });
    expect(report.details).toContainEqual({ label: "Período", value: "31/10/2026" });
  });

  it("repasse com casas decimais mostra o percentual com vírgula", () => {
    const report = statementReport({ ...STATEMENT, shareBps: 3333 });
    expect(report.highlights).toEqual([
      { label: "Bruto", cents: 280_000 },
      { label: "Parte do parceiro (33,33%)", cents: 93_324 },
      { label: "Você recebe", cents: 186_676 },
    ]);
  });

  it("conta os atendimentos do fechamento", () => {
    const report = statementReport({ ...STATEMENT, receivables: [STATEMENT.receivables[0]] });
    expect(report.details).toContainEqual({ label: "Atendimentos", value: "1" });
  });

  it("sem parceiro ou unidade, o subtítulo mostra só o que existe", () => {
    expect(statementReport({ ...STATEMENT, unitName: null }).subtitle).toBe("Fechamento · Clínica Bem-Estar");
    expect(statementReport({ ...STATEMENT, partnerName: null, unitName: null }).subtitle).toBe("Fechamento");
  });

  it("nome do arquivo sem acentos, símbolos ou espaços", () => {
    expect(statementReport({ ...STATEMENT, name: "Março/2026 – 1ª quinzena!" }).fileName).toBe(
      "fechamento-marco-2026-1a-quinzena",
    );
  });

  it("nome sem letras nem números usa o fim do período no arquivo", () => {
    expect(statementReport({ ...STATEMENT, name: "—" }).fileName).toBe("fechamento-2026-10-31");
  });
});

describe("statementReportFor", () => {
  function deps(statement: StatementReportData | null = STATEMENT) {
    return { findStatement: vi.fn(async () => statement) };
  }

  it("devolve o formato e o relatório do fechamento", async () => {
    const d = deps();
    const result = await statementReportFor({ format: "xlsx" }, STATEMENT_ID, { actor: ADMIN }, d);
    expect(result).toEqual({ ok: true, format: "xlsx", report: statementReport(STATEMENT) });
    expect(d.findStatement).toHaveBeenCalledWith(STATEMENT_ID);
  });

  it("sem acesso ao workspace, não busca o fechamento", async () => {
    const d = deps();
    const result = await statementReportFor({ format: "pdf" }, STATEMENT_ID, { actor: null }, d);
    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(d.findStatement).not.toHaveBeenCalled();
  });

  it("sem ver o caixa do workspace nem o da unidade, não pode baixar", async () => {
    const d = deps();
    const actor = withPages({ workspace: ["home", "calendar"], unit: ["overview"] });
    const result = await statementReportFor({ format: "pdf" }, STATEMENT_ID, { actor }, d);
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(d.findStatement).not.toHaveBeenCalled();
  });

  it("quem vê o caixa do workspace pode baixar", async () => {
    const actor = withPages({ workspace: ["cash_flow"] });
    const result = await statementReportFor({ format: "pdf" }, STATEMENT_ID, { actor }, deps());
    expect(result.ok).toBe(true);
  });

  it("quem vê só o caixa da unidade também pode baixar", async () => {
    const actor = withPages({ unit: ["cash_flow"] });
    const result = await statementReportFor({ format: "pdf" }, STATEMENT_ID, { actor }, deps());
    expect(result.ok).toBe(true);
  });

  it("formato inválido é recusado antes de buscar o fechamento", async () => {
    const d = deps();
    const result = await statementReportFor({ format: "csv" }, STATEMENT_ID, { actor: ADMIN }, d);
    expect(result).toEqual({ ok: false, error: "invalid_format" });
    expect(d.findStatement).not.toHaveBeenCalled();
  });

  it("sem id ou com fechamento de outro workspace, não encontra", async () => {
    const d = deps(null);
    expect(await statementReportFor({ format: "pdf" }, null, { actor: ADMIN }, d)).toEqual({
      ok: false,
      error: "statement_not_found",
    });
    expect(d.findStatement).not.toHaveBeenCalled();
    expect(await statementReportFor({ format: "pdf" }, STATEMENT_ID, { actor: ADMIN }, d)).toEqual({
      ok: false,
      error: "statement_not_found",
    });
  });
});
