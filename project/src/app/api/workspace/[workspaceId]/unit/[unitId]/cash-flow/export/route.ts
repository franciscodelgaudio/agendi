import { parseCashFlowQuery } from "@/lib/cash-flow"
import { cashFlowReport, parseExportFormat } from "@/lib/cash-flow-export"
import { parseTherapistListQuery, therapistListPage } from "@/lib/cash-flow-list"
import { allPages, loadCashFlowSummaryScreen } from "@/lib/cash-flow-screen-store"
import { findVisiblePages } from "@/lib/page-guard"
import { reportResponse } from "@/lib/report-file"
import { getSessionUserId } from "@/lib/session"

// Resumo do caixa do ano em PDF ou XLSX (?format=), com o ano e a busca da tela e todas as massagistas encontradas.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/workspace/[workspaceId]/unit/[unitId]/cash-flow/export">,
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

  const now = new Date()
  const query = { ...parseCashFlowQuery(search, now), view: "year" as const }
  const data = await loadCashFlowSummaryScreen(workspaceId, userId, unitId, query.date, now)
  if (!data) return Response.json({ error: "Unidade não encontrada." }, { status: 404 })
  const filters = parseTherapistListQuery(search)
  const therapists = allPages((page) => therapistListPage(data.therapists, { ...filters, page }))

  return reportResponse(
    cashFlowReport({
      unitName: data.unitName,
      query,
      range: data.shown,
      balanceCents: data.balanceCents,
      openingBalance: data.openingBalance,
      summary: data.summary,
      columns: data.columns,
      curve: data.curve,
      costs: data.costs,
      therapists,
    }),
    format,
  )
}
