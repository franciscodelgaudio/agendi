import type { Actor } from "@/lib/permissions"
import { workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"

// Para server actions: o workspace e o acesso do usuário nele, ou null se ele
// não tiver acesso (ou o id for inválido).
export async function findWorkspaceAccess(workspaceId: string, userId: string) {
  const access = workspaceAccessStages(workspaceId, userId)
  if (!access) return null
  const [workspace] = await Workspace.aggregate<{ id: string; name: string; actor: Actor }>([
    ...access,
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, actor: 1 } },
  ])
  return workspace ?? null
}
