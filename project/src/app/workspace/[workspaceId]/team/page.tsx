import { notFound, redirect } from "next/navigation"
import type { WorkspaceRole } from "@/lib/member-role"
import { parseCashFlowQuery } from "@/lib/cash-flow"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseUnitTeamListQuery, UNIT_TEAM_PAGE_SIZE, unitTeamListPage, type UnitTeamListItem } from "@/lib/unit-team-list"
import { Workspace } from "@/models/Workspace"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { TeamTable } from "@/components/team-table"
import { UnitTeamFilters } from "@/components/unit-team-filters"

// Equipe de todas as unidades: uma linha por pessoa em cada unidade, já que a
// remuneração é definida por unidade.
export default async function TeamPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/team">) {
  const { workspaceId } = await params
  const query = parseUnitTeamListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "team" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    role: WorkspaceRole
    units: { id: string; name: string }[]
    members: (UnitTeamListItem & { unitId: string })[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          { $match: { role: { $in: ["massage_therapist", "receptionist"] } } },
          { $unwind: "$units" },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $set: { user: { $first: "$user" } } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              unitId: { $toString: "$units.unitId" },
              role: 1,
              email: { $ifNull: ["$user.email", "$email"] },
              name: { $ifNull: ["$user.name", null] },
              image: { $ifNull: ["$user.image", null] },
              pending: { $eq: [{ $ifNull: ["$userId", null] }, null] },
              commissionPercent: { $ifNull: ["$units.commissionPercent", null] },
              salaryCents: { $ifNull: ["$units.salaryCents", null] },
              bonuses: { $ifNull: ["$units.bonuses", []] },
              startDate: { $ifNull: ["$units.startDate", null] },
              payDay: { $ifNull: ["$units.payDay", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, role: 1, units: 1, members: 1 } },
  ])
  if (!workspace) notFound()
  const { role } = workspace
  const unitNames = new Map(workspace.units.map((unit) => [unit.id, unit.name]))
  // Vínculos com unidades que não existem mais ficam de fora. Ordenadas pela unidade antes,
  // a ordenação por nome (estável) deixa a mesma pessoa em ordem de unidade.
  const members = workspace.members
    .flatMap((member) => {
      const unitName = unitNames.get(member.unitId)
      return unitName ? [{ ...member, unitName }] : []
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName, "pt-BR", { sensitivity: "base" }))
  // Busca, filtros e paginação são feitos aqui (poucas pessoas por workspace).
  const result = unitTeamListPage(members, query)

  const pathname = `/workspace/${workspaceId}/team`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = query
  // Página além da última vai para a última.
  const pages = Math.ceil(result.total / UNIT_TEAM_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Equipe</h2>
      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch query={filters} placeholder="Buscar nome ou email..." />
          <UnitTeamFilters query={filters} />
        </div>
      )}
      <TeamTable
        workspaceId={workspaceId}
        role={role}
        rows={result.rows}
        filters={filters}
        pathname={pathname}
        today={parseCashFlowQuery({}).date}
        showUnit
        emptyText={
          members.length === 0
            ? "Ninguém trabalha nas unidades ainda. Escolha a equipe ao editar cada unidade."
            : "Ninguém encontrado."
        }
      />
      <ListPagination
        query={filters}
        page={page}
        pageSize={UNIT_TEAM_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="pessoas"
      />
    </div>
  )
}
