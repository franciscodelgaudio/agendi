import { isObjectIdOrHexString, Types } from "mongoose"
import { memberAttendsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Unit } from "@/models/Unit"
import { User } from "@/models/User"
import { WorkspaceMember } from "@/models/WorkspaceMember"

// Ids inválidos são descartados antes da consulta; a validação os trata como não encontrados.
export function objectIds(ids: string[]) {
  return ids.filter((id) => isObjectIdOrHexString(id)).map((id) => new Types.ObjectId(id))
}

// Para server actions: dos ids pedidos, quem pode atender no workspace — membros que
// aceitaram o convite e são administradores ou têm role que realiza atendimentos.
export async function findWorkspaceTherapists(workspaceId: string, ids: string[], unitId?: string) {
  const userIds = objectIds(ids)
  const unit = unitId
    ? await Unit.findOne({ _id: unitId, workspaceId }).select({ workspaceMemberIds: 1 }).lean()
    : null
  if (unitId && !unit) return []
  const members = await WorkspaceMember.aggregate<{ userId: Types.ObjectId }>([
    {
      $match: {
        workspaceId: new Types.ObjectId(workspaceId),
        userId: { $in: userIds },
        ...(unit && { _id: { $in: unit.workspaceMemberIds } }),
      },
    },
    ...memberAttendsStages(),
    { $match: { attends: true } },
    { $project: { _id: 0, userId: 1 } },
  ])
  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } }).select({ name: 1, email: 1 }).lean()
  return users.map((user) => ({ id: user._id.toString(), name: user.name ?? user.email }))
}
