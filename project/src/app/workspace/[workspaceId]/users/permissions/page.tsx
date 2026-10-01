import { notFound, redirect } from "next/navigation"
import type { Actor } from "@/lib/permissions"
import { visiblePages } from "@/lib/page-access"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"
import { RolePermissionsForm, type RoleView } from "@/components/role-permissions-form"

export default async function PermissionsPage({ params }: PageProps<"/workspace/[workspaceId]/users/permissions">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; roles: RoleView[] }>([
    ...access,
    {
      $lookup: {
        from: "roles",
        localField: "_id",
        foreignField: "workspaceId",
        as: "roles",
        pipeline: [
          { $sort: { name: 1 } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, permissions: 1, pages: 1 } },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, roles: 1 } },
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
