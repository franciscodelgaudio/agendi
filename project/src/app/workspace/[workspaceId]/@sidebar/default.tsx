import { Suspense } from "react"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/workspace/[workspaceId]/@sidebar/app-sidebar"
import { logoutAction } from "@/lib/actions/auth"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { SidebarSkeleton } from "@/components/workspace/[workspaceId]/@sidebar/sidebar-skeleton"

// Único arquivo do slot: o default.tsx é renderizado para qualquer sub-rota
// de /workspace/[workspaceId], então a sidebar aparece em todas elas.
// O Suspense é daqui: sem ele, a espera cairia no loading.tsx do workspace (o skeleton do início).
export default async function SidebarSlot({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  return (
    <Suspense fallback={<SidebarSkeleton />}>
      <WorkspaceSidebar workspaceId={workspaceId} />
    </Suspense>
  )
}

async function WorkspaceSidebar({ workspaceId }: { workspaceId: string }) {
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    id: string
    name: string
    avatarUrl: string | null
    actor: Actor
  }>([
    ...access,
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        avatarUrl: { $ifNull: ["$avatarUrl", null] },
        actor: 1,
      },
    },
  ])
  if (!workspace) notFound()

  const { actor, ...header } = workspace
  return (
    <AppSidebar
      workspace={header}
      pages={visiblePages(actor).workspace}
      actor={actor}
      user={user}
      logoutAction={logoutAction}
    />
  )
}
