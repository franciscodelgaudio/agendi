import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { cashFlowReport, parseExportFormat } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-export"
import { parseTherapistListQuery, therapistListPage } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import { allPages, loadCashFlowSummaryScreen } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-screen-store"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-guard"
import { reportResponse } from "@/service/_shared/report-file"
import { getSessionUserId } from "@/service/(auth)/session"

// Resumo do caixa do ano em PDF ou XLSX (?format=), com o ano e a busca da tela e todos os profissionais encontrados.
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
  const data = await loadCashFlowSummaryScreen(workspaceId, userId, unitId, query.date, now, search.costs)
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
