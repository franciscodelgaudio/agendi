import { notFound, redirect } from "next/navigation"
import { canManageMembers, type WorkspaceRole } from "@/lib/member-role"
import { visiblePages, type HiddenPages } from "@/lib/page-access"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"
import { PageAccessForm } from "@/components/page-access-form"

export default async function PermissionsPage({ params }: PageProps<"/workspace/[workspaceId]/users/permissions">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ role: WorkspaceRole; hiddenPages: HiddenPages | null }>([
    ...access,
    { $project: { _id: 0, role: 1, hiddenPages: { $ifNull: ["$hiddenPages", null] } } },
  ])
  if (!workspace) notFound()
  // Só quem gerencia membros define permissões; os demais voltam para a lista.
  if (!canManageMembers(workspace.role)) redirect(`/workspace/${workspaceId}/users`)

  return (
    <PageAccessForm
      workspaceId={workspaceId}
      visible={{
        massage_therapist: visiblePages("massage_therapist", workspace.hiddenPages),
        receptionist: visiblePages("receptionist", workspace.hiddenPages),
      }}
    />
  )
}
