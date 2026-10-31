import { isObjectIdOrHexString, Types } from "mongoose"
import { memberAttendsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Unit } from "@/models/Unit"
import { WorkspaceMember } from "@/models/WorkspaceMember"

// Ids inválidos são descartados antes da consulta; a validação os trata como não encontrados.
export function objectIds(ids: string[]) {
  return ids.filter((id) => isObjectIdOrHexString(id)).map((id) => new Types.ObjectId(id))
}

export async function findWorkspaceTherapists(workspaceId: string, ids: string[], unitId?: string) {
  const unit = unitId
    ? await Unit.findOne({ _id: unitId, workspaceId }).select({ workspaceMemberIds: 1 }).lean()
    : null
  if (unitId && !unit) return []
  const requested = objectIds(ids)
  const memberIds = unit ? requested.filter((id) => unit.workspaceMemberIds.some((memberId) => memberId.equals(id))) : requested
  const members = await WorkspaceMember.aggregate<{ id: string; name: string }>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId), _id: { $in: memberIds } } },
    ...memberAttendsStages(),
    { $match: { attends: true } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $project: { _id: 0, id: { $toString: "$_id" }, name: { $ifNull: ["$user.name", "$user.email"] } } },
  ])
  return members
}
