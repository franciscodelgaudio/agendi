import { notFound, redirect } from "next/navigation"
import { UNIT_PAGE_PATHS, WORKSPACE_PAGE_PATHS, type UnitPage, type WorkspacePage } from "@/service/workspace/[workspaceId]/page-access"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-access-store"

export { findVisiblePages } from "@/service/workspace/[workspaceId]/page-access-store"

// Para páginas: sem acesso ao workspace, 404; com a página oculta para a role do
// usuário, manda para a primeira aba liberada da unidade ou, sem nenhuma, para a
// primeira página liberada do sistema (sempre há ao menos uma).
export async function requirePage(
  workspaceId: string,
  userId: string,
  page: { workspace: WorkspacePage } | { unit: UnitPage; unitId: string },
) {
  const found = await findVisiblePages(workspaceId, userId)
  if (!found) notFound()
  const { pages } = found
  const base = `/workspace/${workspaceId}`

  if ("workspace" in page) {
    if (pages.workspace.includes(page.workspace)) return found
  } else {
    if (pages.unit.includes(page.unit)) return found
    if (pages.unit.length > 0) redirect(`${base}/unit/${page.unitId}${UNIT_PAGE_PATHS[pages.unit[0]]}`)
  }
  redirect(`${base}${WORKSPACE_PAGE_PATHS[pages.workspace[0]]}`)
}
