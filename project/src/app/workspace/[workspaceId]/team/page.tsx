import { notFound, redirect } from "next/navigation"
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { parseUnitTeamListQuery, UNIT_TEAM_PAGE_SIZE, unitTeamListPage, type UnitTeamListItem } from "@/service/workspace/[workspaceId]/team/unit-team-list"
import type { CommissionBase } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member"
import { memberAttendsStages, memberRoleNameStages, rolesLookup, type RoleOption } from "@/service/workspace/[workspaceId]/team/unit-team"
import { Workspace } from "@/models/Workspace"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { TeamTable, type TeamRow } from "@/components/workspace/[workspaceId]/shared/team/team-table"
import { UnitTeamFilters } from "@/components/workspace/[workspaceId]/shared/team/unit-team-filters"

// Equipe de todas as unidades: uma linha por pessoa, com a remuneração de cada unidade
// em que ela trabalha.
export default async function TeamPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/team">) {
  const { workspaceId } = await params
  const query = parseUnitTeamListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "team" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    units: { id: string; name: string }[]
    members: (UnitTeamListItem & { unitId: string; commissionBase: CommissionBase })[]
    roles: RoleOption[]
  }>([
    ...access,
    rolesLookup(),
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
          ...memberAttendsStages(),
          ...memberRoleNameStages(),
          { $unwind: "$units" },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $set: { user: { $first: "$user" } } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              unitId: { $toString: "$units.unitId" },
              admin: { $eq: ["$admin", true] },
              roleId: { $ifNull: [{ $toString: "$roleId" }, null] },
              roleName: 1,
              // Vínculo antigo, sem base guardada: a da função.
              commissionBase: { $ifNull: ["$units.commissionBase", { $cond: ["$attends", "services", "gross"] }] },
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
    { $project: { _id: 0, actor: 1, units: 1, members: 1, roles: 1 } },
  ])
  if (!workspace) notFound()
  const { actor } = workspace
  const unitNames = new Map(workspace.units.map((unit) => [unit.id, unit.name]))
  // Vínculos com unidades que não existem mais ficam de fora. Ordenados pela unidade antes,
  // as unidades de cada pessoa ficam em ordem de nome.
  const links = workspace.members
    .flatMap((member) => {
      const unitName = unitNames.get(member.unitId)
      return unitName ? [{ ...member, unitName }] : []
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName, "pt-BR", { sensitivity: "base" }))
  const people = new Map<string, TeamRow>()
  for (const { unitId, unitName, commissionBase, ...member } of links) {
    const { startDate, payDay, commissionPercent, salaryCents, bonuses } = member
    const link = { unitId, unitName, commissionBase, startDate, payDay, commissionPercent, salaryCents, bonuses }
    const person = people.get(member.id)
    if (!person) {
      people.set(member.id, { ...member, links: [link] })
      continue
    }
    person.links.push(link)
    // Para os filtros: comissão ou salário em alguma unidade; sem remuneração só se não houver em nenhuma.
    person.commissionPercent ??= commissionPercent
    person.salaryCents ??= salaryCents
    person.bonuses = [...person.bonuses, ...bonuses]
  }
  const members = [...people.values()]
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
          <UnitTeamFilters query={filters} roles={workspace.roles} />
        </div>
      )}
      <TeamTable
        workspaceId={workspaceId}
        actor={actor}
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
