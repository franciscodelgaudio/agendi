import { parseCashFlowQuery } from "@/lib/cash-flow"
import { expenseReport, parseExportFormat } from "@/lib/cash-flow-export"
import { expenseListPage, parseExpenseListQuery } from "@/lib/cash-flow-list"
import { allPages, loadExpensesScreen } from "@/lib/cash-flow-screen-store"
import { findVisiblePages } from "@/lib/page-guard"
import { reportResponse } from "@/lib/report-file"
import { getSessionUserId } from "@/lib/session"

// Despesas do mês em PDF ou XLSX (?format=), com a busca, os filtros e a ordenação da tela, sem paginar.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/export">,
) {
  const { workspaceId, unitId } = await params
  const userId = await getSessionUserId()
  if (!userId) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 })
  const search = Object.fromEntries(new URL(request.url).searchParams)
  const format = parseExportFormat(search.format)
  if (!format) return Response.json({ error: "Formato inválido." }, { status: 400 })
  const visible = await findVisiblePages(workspaceId, userId)
  if (!visible) return Response.json({ error: "Workspace não encontrado." }, { status: 404 })
  if (!visible.pages.unit.includes("cash_flow")) {
    return Response.json({ error: "Sem permissão para ver o caixa." }, { status: 403 })
  }

  const query = { ...parseCashFlowQuery(search, new Date()), view: "month" as const }
  const data = await loadExpensesScreen(workspaceId, userId, unitId, query)
  if (!data) return Response.json({ error: "Unidade não encontrada." }, { status: 404 })
  const filters = parseExpenseListQuery(search)
  const result = allPages((page) => expenseListPage(data.expenses, { ...filters, page }))

  return reportResponse(
    expenseReport({
      unitName: data.unitName,
      date: query.date,
      groups: data.groups,
      expenses: result.rows,
      totalCents: result.totalCents,
      paidCents: result.paidCents,
    }),
    format,
  )
}
