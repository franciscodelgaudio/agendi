import { getSessionUserId } from "@/service/(auth)/session"
import { reportResponse } from "@/service/_shared/report-file"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  statementReportFor,
  type StatementReportError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement-report"
import { findStatementReport } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement-report-store"

const errors: Record<StatementReportError, { message: string; status: number }> = {
  workspace_not_found: { message: "Workspace não encontrado ou sem permissão.", status: 404 },
  forbidden: { message: "Sem permissão para ver o caixa.", status: 403 },
  invalid_format: { message: "Formato inválido. Use pdf ou xlsx.", status: 400 },
  statement_not_found: { message: "Repasse não encontrado.", status: 404 },
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/workspace/[workspaceId]/cash-flow/statements/[statementId]/export/[format]">,
) {
  const { workspaceId, statementId, format } = await params
  const userId = await getSessionUserId()
  if (!userId) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 })

  const access = await findWorkspaceAccess(workspaceId, userId)
  const result = await statementReportFor({ format }, statementId, { actor: access?.actor ?? null }, {
    findStatement: (id) => findStatementReport(access!.id, id),
  })
  if (!result.ok) {
    const { message, status } = errors[result.error]
    return Response.json({ error: message }, { status })
  }
  return reportResponse(result.report, result.format)
}
