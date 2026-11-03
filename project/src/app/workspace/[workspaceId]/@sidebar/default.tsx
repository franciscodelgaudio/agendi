import { Suspense } from "react"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/workspace/[workspaceId]/@sidebar/app-sidebar"
import { MobileUnitBar } from "@/components/workspace/[workspaceId]/@sidebar/mobile-unit-bar"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { logoutAction } from "@/lib/actions/auth"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { unitCookieName } from "@/service/workspace/[workspaceId]/unit-context"
import type { SidebarUnit } from "@/components/workspace/[workspaceId]/@sidebar/unit-switcher"
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
    imageUrl: string | null
    actor: Actor
    units: SidebarUnit[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              imageUrl: { $ifNull: ["$imageUrl", null] },
              inventoryId: { $ifNull: [{ $toString: "$inventoryId" }, null] },
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        imageUrl: { $ifNull: ["$imageUrl", null] },
        actor: 1,
        units: 1,
      },
    },
  ])
  if (!workspace) notFound()

  const { actor, units, ...header } = workspace
  const savedUnitId = (await cookies()).get(unitCookieName(workspace.id))?.value ?? null
  return (
    <>
      <MobileUnitBar
        workspaceId={workspace.id}
        units={units}
        savedUnitId={savedUnitId}
        canCreate={can(actor, "units.manage") && can(actor, "services.manage")}
      />
      <AppSidebar
        workspace={header}
        units={units}
        savedUnitId={savedUnitId}
        pages={visiblePages(actor)}
        actor={actor}
        user={user}
        logoutAction={logoutAction}
      />
    </>
  )
}
