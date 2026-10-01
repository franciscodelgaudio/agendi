import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { expenseGroupReport, parseExportFormat } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-export"
import { expenseGroupListPage, parseExpenseGroupListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import { allPages, loadExpenseGroupsScreen } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-screen-store"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-guard"
import { reportResponse } from "@/service/_shared/report-file"
import { getSessionUserId } from "@/service/(auth)/session"

// Planejamento do mês ou do ano em PDF ou XLSX (?format=), com a busca, o filtro e a ordenação da tela, sem paginar.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/export">,
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

  // A visão semanal não se aplica aos grupos.
  const now = new Date()
  const parsed = parseCashFlowQuery(search, now)
  const query = { ...parsed, view: parsed.view === "year" ? ("year" as const) : ("month" as const) }
  const data = await loadExpenseGroupsScreen(workspaceId, userId, unitId, query, now)
  if (!data) return Response.json({ error: "Unidade não encontrada." }, { status: 404 })
  const filters = parseExpenseGroupListQuery(search)
  const result = allPages((page) => expenseGroupListPage(data.summary, { ...filters, page }))

  return reportResponse(
    expenseGroupReport({ unitName: data.unitName, query, groups: result.rows, sums: result.sums }),
    format,
  )
}
