import { notFound, redirect } from "next/navigation"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { RolePermissionsForm, type RoleView } from "@/components/workspace/[workspaceId]/users/permissions/role-permissions-form"

export default async function PermissionsPage({ params }: PageProps<"/workspace/[workspaceId]/users/permissions">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; roles: RoleView[] }>([
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
  // Só administradores definem funções e permissões; os demais voltam para a lista.
  if (!workspace.actor.admin) redirect(`/workspace/${workspaceId}/users`)

  // Páginas filtradas pelo catálogo atual, como no acesso de quem tem a função.
  const roles = workspace.roles.map((role) => ({
    ...role,
    pages: visiblePages({ admin: false, permissions: role.permissions, pages: role.pages }),
  }))

  return <RolePermissionsForm workspaceId={workspaceId} roles={roles} />
}
