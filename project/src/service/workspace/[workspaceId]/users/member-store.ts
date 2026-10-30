import { isObjectIdOrHexString, Types } from "mongoose";
import { ADMIN_ROLE_NAME } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { Role } from "@/models/Role";
import { WorkspaceMember } from "@/models/WorkspaceMember";

// Role do workspace e se ela é a de administrador; id inválido ou de outro workspace vira null.
export async function findWorkspaceRole(workspaceId: string, roleId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(roleId)) return null;
  const role = await Role.findOne({ _id: roleId, workspaceId }).select({ admin: 1 }).lean();
  return role && { id: role._id.toString(), admin: !!role.admin };
}

function adminRoleIds(workspaceId: string | Types.ObjectId) {
  return Role.distinct<Types.ObjectId>("_id", { workspaceId, admin: true });
}

// Administradores que já aceitaram o convite.
export async function countActiveAdmins(workspaceId: string) {
  const roleIds = await adminRoleIds(workspaceId);
  return WorkspaceMember.countDocuments({ workspaceId, roleId: { $in: roleIds }, userId: { $ne: null } });
}

export async function isWorkspaceAdmin(workspaceId: string, userId: string) {
  if (!isObjectIdOrHexString(workspaceId)) return false;
  const roleIds = await adminRoleIds(workspaceId);
  return !!(await WorkspaceMember.exists({ workspaceId, userId, roleId: { $in: roleIds } }));
}

// Role fixa de administrador, criada junto com o workspace.
export async function createAdminRole(workspaceId: Types.ObjectId) {
  const role = await Role.create({ workspaceId, name: ADMIN_ROLE_NAME, admin: true });
  return role._id;
}
