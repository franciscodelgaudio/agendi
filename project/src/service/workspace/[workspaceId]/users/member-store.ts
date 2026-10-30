import { isObjectIdOrHexString, Types } from "mongoose";
import { ADMIN_ROLE_NAME } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { Invite } from "@/models/Invite";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { WorkspaceMember } from "@/models/WorkspaceMember";

export const ADMIN_ROLE = { name: ADMIN_ROLE_NAME, admin: true, permissions: [], pages: { workspace: [], unit: [] } };

export async function findWorkspaceRole(workspaceId: string, roleId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(roleId)) return null;
  const workspace = await Workspace.findOne({ _id: workspaceId, "roles._id": roleId }, { "roles.$": 1 }).lean();
  const role = workspace?.roles[0];
  return role ? { id: role._id.toString(), admin: !!role.admin } : null;
}

async function adminRoleIds(workspaceId: string | Types.ObjectId) {
  const workspace = await Workspace.findById(workspaceId).select({ roles: 1 }).lean();
  return (workspace?.roles ?? []).filter((role) => role.admin).map((role) => role._id);
}

export async function countAdmins(workspaceId: string) {
  const roleIds = await adminRoleIds(workspaceId);
  return WorkspaceMember.countDocuments({ workspaceId, roleId: { $in: roleIds } });
}

export async function isWorkspaceAdmin(workspaceId: string, userId: string) {
  if (!isObjectIdOrHexString(workspaceId)) return false;
  const roleIds = await adminRoleIds(workspaceId);
  return !!(await WorkspaceMember.exists({ workspaceId, userId, roleId: { $in: roleIds } }));
}

export async function isAlreadyInWorkspace(workspaceId: string, email: string) {
  if (await Invite.exists({ workspaceId, email })) return true;
  const user = await User.findOne({ email }).select({ _id: 1 }).lean();
  return !!user && !!(await WorkspaceMember.exists({ workspaceId, userId: user._id }));
}

export async function listAdminWorkspaces(userId: string) {
  const memberships = await WorkspaceMember.find({ userId }).select({ workspaceId: 1, roleId: 1 }).lean();
  const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } })
    .select({ name: 1, roles: 1 })
    .lean();
  return workspaces
    .filter((workspace) => {
      const membership = memberships.find((m) => m.workspaceId.equals(workspace._id));
      return workspace.roles.some((role) => role.admin && membership?.roleId.equals(role._id));
    })
    .map((workspace) => ({ id: workspace._id.toString(), name: workspace.name }));
}
