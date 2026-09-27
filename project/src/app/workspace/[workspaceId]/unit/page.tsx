import { notFound } from "next/navigation"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { unitListPipeline, parseUnitListQuery } from "@/lib/unit-list"
import type { RevenueShare } from "@/lib/revenue-share"
import type { TreatmentRoomOption } from "@/components/treatment-room-fields"
import { teamCandidatesLookup, type TeamCandidate } from "@/lib/unit-team"
import { Workspace } from "@/models/Workspace"
import { CreateUnitSheet } from "@/components/create-unit-sheet"
import { ListSearch } from "@/components/list-search"
import { UnitTable } from "@/components/unit-table"
import { UnitsEmpty } from "@/components/units-empty"

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
      createdAt: Date
      updatedAt: Date
    }[]
    unitCount: number
    role: WorkspaceRole
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
        role: 1,
        team: 1,
        unitCount: { $ifNull: [{ $first: "$unitCount.n" }, 0] },
      },
    },
  ])
  if (!workspace) notFound()
  const { units, unitCount } = workspace
  const canManage = canManageMembers(workspace.role)
  const team = { candidates: workspace.team, canLinkTherapists: workspace.role === "owner" }

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
