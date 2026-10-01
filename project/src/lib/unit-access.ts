import { checkUnitAccess, type UnitAccessResult } from "@/lib/access-check"
import type { Permission } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Unit } from "@/models/Unit"

// Para server actions: ids do workspace e da unidade se a unidade for do workspace e o
// usuário tiver a permissão pedida nele; senão o motivo (sem acesso, sem permissão ou
// unidade inválida).
export async function findManagedUnit(
  workspaceId: string,
  unitId: string,
  userId: string,
  permission: Permission,
): Promise<UnitAccessResult> {
  const access = await findWorkspaceAccess(workspaceId, userId)
  return checkUnitAccess(access, unitId, permission, async (id, unit) => !!(await Unit.exists({ _id: unit, workspaceId: id })))
}
