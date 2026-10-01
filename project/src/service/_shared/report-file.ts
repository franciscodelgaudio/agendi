import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
import type { ExportFormat, Report, ReportColumn, ReportTable, ReportValue } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-export"

const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const percentFormat = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })
const numberFormat = new Intl.NumberFormat("pt-BR")

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

// As fontes padrão do PDF não têm o espaço fino que o Intl usa depois do "R$".
function formatCell(kind: ReportColumn["kind"], value: ReportValue) {
  if (value === null) return ""
  if (typeof value === "string") return kind === "date" ? value.split("-").reverse().join("/") : value
  if (kind === "money") return currencyFormat.format(value / 100).replace(/\s/g, " ")
  if (kind === "percent") return percentFormat.format(value).replace(/\s/g, " ")
  return numberFormat.format(value)
}

function money(cents: number | null) {
  return cents === null ? "Não informado" : formatCell("money", cents)
}

function toPdf(report: Report) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const margin = 40
  doc.setFont("helvetica", "bold").setFontSize(16).text(report.title, margin, 50)
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100).text(report.subtitle, margin, 68)
  let y = 92
  for (const { label, cents } of report.highlights) {
    doc.setTextColor(100).text(label, margin, y)
    doc.setTextColor(20).setFont("helvetica", "bold").text(money(cents), margin + 170, y)
    doc.setFont("helvetica", "normal")
    y += 16
  }

  for (const table of report.tables) {
    y += 14
    // Título sem espaço para a tabela vai para a próxima página junto com ela.
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage()
      y = 50
    }
    doc.setTextColor(20).setFont("helvetica", "bold").setFontSize(12).text(table.title, margin, y)
    doc.setFont("helvetica", "normal")
    const align = (column: ReportColumn) => (column.kind === "text" || column.kind === "date" ? "left" : "right")
    const cells = (row: ReportValue[]) => row.map((value, index) => formatCell(table.columns[index].kind, value))
    autoTable(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin },
      head: [table.columns.map((column) => ({ content: column.label, styles: { halign: align(column) } }))],
      body: table.rows.length > 0 ? table.rows.map(cells) : [[{ content: "Nenhum registro.", colSpan: table.columns.length }]],
      foot: table.total ? [cells(table.total)] : undefined,
      showFoot: "lastPage",
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 4, textColor: 20 },
      headStyles: { fontStyle: "bold", fillColor: 244 },
      footStyles: { fontStyle: "bold", fillColor: 244 },
      columnStyles: Object.fromEntries(table.columns.map((column, index) => [index, { halign: align(column) }])),
    })
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }
  return Buffer.from(doc.output("arraybuffer"))
}

const XLSX_FORMATS: Partial<Record<ReportColumn["kind"], string>> = {
  money: '"R$" #,##0.00;-"R$" #,##0.00',
  percent: "0.0%",
  date: "dd/mm/yyyy",
}

// Dinheiro em reais, percentual em fração e dia como data, para dar para fazer contas na planilha.
function xlsxValue(kind: ReportColumn["kind"], value: ReportValue) {
  if (value === null) return null
  if (kind === "money" && typeof value === "number") return value / 100
  if (kind === "date" && typeof value === "string") return toDate(value)
  return value
}

// Nomes de aba têm até 31 caracteres e não aceitam alguns símbolos.
function sheetName(title: string) {
  return title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31)
}

function addTableSheet(workbook: ExcelJS.Workbook, table: ReportTable) {
  const sheet = workbook.addWorksheet(sheetName(table.title), { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = table.columns.map((column) => ({
    header: column.label,
    width: column.kind === "text" ? 28 : 16,
    style: XLSX_FORMATS[column.kind] ? { numFmt: XLSX_FORMATS[column.kind] } : {},
  }))
  sheet.getRow(1).font = { bold: true }
  const values = (row: ReportValue[]) => row.map((value, index) => xlsxValue(table.columns[index].kind, value))
  sheet.addRows(table.rows.map(values))
  if (table.total) sheet.addRow(values(table.total)).font = { bold: true }
}

async function toXlsx(report: Report) {
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet("Resumo")
  summary.columns = [{ width: 32 }, { width: 18, style: { numFmt: XLSX_FORMATS.money } }]
  summary.addRow([report.title]).font = { bold: true, size: 14 }
  summary.addRow([report.subtitle])
  summary.addRow([])
  for (const { label, cents } of report.highlights) summary.addRow([label, cents === null ? null : cents / 100])
  for (const table of report.tables) addTableSheet(workbook, table)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

// Resposta de download do relatório no formato pedido.
export async function reportResponse(report: Report, format: ExportFormat) {
  const body = format === "pdf" ? toPdf(report) : await toXlsx(report)
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${report.fileName}.${format}"`,
      "Cache-Control": "no-store",
    },
  })
}
