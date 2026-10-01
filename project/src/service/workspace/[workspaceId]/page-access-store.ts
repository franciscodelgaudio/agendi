import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"

// Acesso do usuário no workspace e as páginas que ele pode ver; null sem acesso.
export async function findVisiblePages(workspaceId: string, userId: string) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access) return null
  const [workspace] = await Workspace.aggregate<{ actor: Actor }>([...access, { $project: { _id: 0, actor: 1 } }])
  return workspace ? { actor: workspace.actor, pages: visiblePages(workspace.actor) } : null
}
