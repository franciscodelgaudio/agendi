import { notFound, redirect } from "next/navigation"
import { Types } from "mongoose"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Invite } from "@/models/Invite"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { RolePermissionsForm, type RoleView } from "@/components/workspace/[workspaceId]/users/permissions/role-permissions-form"

type StoredRole = Omit<RoleView, "members" | "invites">

const countByRole = [{ $group: { _id: "$roleId", n: { $sum: 1 } } }, { $project: { _id: 0, roleId: { $toString: "$_id" }, n: 1 } }]

export default async function PermissionsPage({ params }: PageProps<"/workspace/[workspaceId]/users/permissions">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; roles: StoredRole[] }>([
    ...access,
    {
      $project: {
        _id: 0,
        actor: 1,
        roles: {
          $map: {
            input: {
              $sortArray: {
                input: { $filter: { input: { $ifNull: ["$roles", []] }, cond: { $ne: ["$$this.admin", true] } } },
                sortBy: { name: 1 },
              },
            },
            in: { id: { $toString: "$$this._id" }, name: "$$this.name", permissions: "$$this.permissions", pages: "$$this.pages" },
          },
        },
      },
    },
  ])
  if (!workspace) notFound()
  if (!workspace.actor.admin) redirect(`/workspace/${workspaceId}/users`)

  const match = { $match: { workspaceId: new Types.ObjectId(workspaceId) } }
  const [memberCounts, inviteCounts] = await Promise.all([
    WorkspaceMember.aggregate<{ roleId: string; n: number }>([match, ...countByRole]),
    Invite.aggregate<{ roleId: string; n: number }>([match, ...countByRole]),
  ])
  const members = new Map(memberCounts.map((row) => [row.roleId, row.n]))
  const invites = new Map(inviteCounts.map((row) => [row.roleId, row.n]))

  const roles = workspace.roles.map((role) => ({
    ...role,
    pages: visiblePages({ admin: false, permissions: role.permissions, pages: role.pages }),
    members: members.get(role.id) ?? 0,
    invites: invites.get(role.id) ?? 0,
  }))

  return <RolePermissionsForm workspaceId={workspaceId} roles={roles} />
}
