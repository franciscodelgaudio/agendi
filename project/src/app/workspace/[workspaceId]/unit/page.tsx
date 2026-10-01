import { notFound } from "next/navigation"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { unitListPipeline, parseUnitListQuery } from "@/service/workspace/[workspaceId]/unit/unit-list"
import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"
import type { TreatmentRoomOption } from "@/components/workspace/[workspaceId]/unit/treatment-room-fields"
import { teamCandidatesLookup, type TeamCandidate } from "@/service/workspace/[workspaceId]/team/unit-team"
import { Workspace } from "@/models/Workspace"
import { CreateUnitSheet } from "@/components/workspace/[workspaceId]/unit/create-unit-sheet"
import { ListSearch } from "@/components/shared/list-search"
import { UnitTable } from "@/components/workspace/[workspaceId]/unit/unit-table"
import { UnitsEmpty } from "@/components/workspace/[workspaceId]/unit/units-empty"

export default async function UnitsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit">) {
  const { workspaceId } = await params
  const query = parseUnitListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "units" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace (e não de units) para que o acesso ao workspace seja garantido.
  // O total sem filtro separa "workspace sem unidades" de "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    units: {
      id: string
      name: string
      avatarUrl: string | null
      revenueShare: RevenueShare | null
      treatmentRooms: TreatmentRoomOption[]
      businessHours: BusinessHours
      createdAt: Date
      updatedAt: Date
    }[]
    unitCount: number
    actor: Actor
    team: TeamCandidate[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: unitListPipeline(query),
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unitCount",
        pipeline: [{ $count: "n" }],
      },
    },
    teamCandidatesLookup(),
    {
      $project: {
        _id: 0,
        units: 1,
        actor: 1,
        team: 1,
        unitCount: { $ifNull: [{ $first: "$unitCount.n" }, 0] },
      },
    },
  ])
  if (!workspace) notFound()
  const { units, unitCount } = workspace
  const canManage = can(workspace.actor, "units.manage")
  const team = { candidates: workspace.team, canEdit: can(workspace.actor, "team.manage") }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Unidades</h2>
        {canManage && unitCount > 0 && <CreateUnitSheet workspaceId={workspaceId} team={team} />}
      </div>
      {unitCount === 0 ? (
        <UnitsEmpty workspaceId={workspaceId} canManage={canManage} team={team} />
      ) : (
        <>
          <ListSearch query={query} placeholder="Buscar unidade..." />
          <UnitTable
            units={units}
            query={query}
            pathname={`/workspace/${workspaceId}/unit`}
            workspaceId={workspaceId}
            canManage={canManage}
            team={team}
          />
        </>
      )}
    </div>
  )
}
