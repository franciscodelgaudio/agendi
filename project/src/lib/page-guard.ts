import { notFound, redirect } from "next/navigation"
import { UNIT_PAGE_PATHS, visiblePages, WORKSPACE_PAGE_PATHS, type UnitPage, type WorkspacePage } from "@/lib/page-access"
import type { Actor } from "@/lib/permissions"
import { workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"

// Acesso do usuário no workspace e as páginas que ele pode ver; null sem acesso.
export async function findVisiblePages(workspaceId: string, userId: string) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access) return null
  const [workspace] = await Workspace.aggregate<{ actor: Actor }>([...access, { $project: { _id: 0, actor: 1 } }])
  return workspace ? { actor: workspace.actor, pages: visiblePages(workspace.actor) } : null
}

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
