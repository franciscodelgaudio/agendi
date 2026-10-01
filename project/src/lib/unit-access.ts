import { isObjectIdOrHexString } from "mongoose"
import { can, type Permission } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Unit } from "@/models/Unit"

// Para server actions: ids do workspace e da unidade se a unidade for do workspace e o
// usuário tiver a permissão pedida nele; senão null.
export async function findManagedUnit(workspaceId: string, unitId: string, userId: string, permission: Permission) {
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access || !can(access.actor, permission) || !isObjectIdOrHexString(unitId)) return null
  const unit = await Unit.exists({ _id: unitId, workspaceId: access.id })
  return unit ? { workspaceId: access.id, unitId } : null
}
