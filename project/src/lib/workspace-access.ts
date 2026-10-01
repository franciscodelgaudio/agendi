import { checkAccess, type AccessError } from "@/lib/access-check"
import type { Actor, Permission } from "@/lib/permissions"
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

// Para server actions: o acesso ao workspace se o usuário tiver a permissão pedida nele;
// senão o motivo (sem acesso ou sem permissão).
export async function findManagedWorkspace(
  workspaceId: string,
  userId: string,
  permission: Permission,
): Promise<{ ok: true; access: { id: string; name: string; actor: Actor } } | { ok: false; error: AccessError }> {
  const access = await findWorkspaceAccess(workspaceId, userId)
  const error = checkAccess(access?.actor ?? null, permission)
  return error ? { ok: false, error } : { ok: true, access: access! }
}
