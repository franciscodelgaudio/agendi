import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
import type { ExportFormat, Report, ReportColumn, ReportTable, ReportValue } from "@/service/_shared/report"

const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

function money(cents: number) {
  return currencyFormat.format(cents / 100).replace(/\s/g, " ")
}

function formatCell(kind: ReportColumn["kind"], value: ReportValue) {
  if (value === null) return ""
  if (typeof value === "string") return kind === "date" ? value.split("-").reverse().join("/") : value
  return kind === "money" ? money(value) : String(value)
}

function toPdf(report: Report) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const margin = 40
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20).text(report.title, margin, 50)
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100).text(report.subtitle, margin, 68)
  let y = 96
  const line = (label: string, value: string, bold: boolean) => {
    doc.setFont("helvetica", "normal").setTextColor(100).text(label, margin, y)
    doc.setFont("helvetica", bold ? "bold" : "normal").setTextColor(20).text(value, margin + 170, y)
    y += 16
  }
  for (const { label, value } of report.details) line(label, value, false)
  y += 8
  for (const { label, cents } of report.highlights) line(label, money(cents), true)

  for (const table of report.tables) {
    y += 14
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage()
      y = 50
    }
    doc.setTextColor(20).setFont("helvetica", "bold").setFontSize(12).text(table.title, margin, y)
    doc.setFont("helvetica", "normal")
    const align = (column: ReportColumn) => (column.kind === "money" ? "right" : "left")
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
  date: "dd/mm/yyyy",
}

function xlsxValue(kind: ReportColumn["kind"], value: ReportValue) {
  if (value === null) return null
  if (kind === "money" && typeof value === "number") return value / 100
  if (kind === "date" && typeof value === "string") return toDate(value)
  return value
}

function sheetName(title: string) {
  return title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31)
}

function addTableSheet(workbook: ExcelJS.Workbook, table: ReportTable) {
  const sheet = workbook.addWorksheet(sheetName(table.title), { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = table.columns.map((column) => ({
    header: column.label,
    width: column.kind === "text" ? 40 : 16,
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
  summary.columns = [{ width: 32 }, { width: 28 }]
  summary.addRow([report.title]).font = { bold: true, size: 14 }
  summary.addRow([report.subtitle])
  summary.addRow([])
  for (const { label, value } of report.details) summary.addRow([label, value])
  summary.addRow([])
  for (const { label, cents } of report.highlights) {
    const row = summary.addRow([label, cents / 100])
    row.getCell(2).numFmt = XLSX_FORMATS.money!
    row.getCell(2).font = { bold: true }
  }
  for (const table of report.tables) addTableSheet(workbook, table)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

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
