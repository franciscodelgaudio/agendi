import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import type { Actor } from "@/lib/permissions"
import { parseCashFlowQuery } from "@/lib/cash-flow"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseUnitTeamListQuery, UNIT_TEAM_PAGE_SIZE, unitTeamListPage, type UnitTeamListItem } from "@/lib/unit-team-list"
import type { CommissionBase } from "@/lib/unit-member"
import { memberAttendsStages, memberRoleNameStages, rolesLookup, type RoleOption } from "@/lib/unit-team"
import { Workspace } from "@/models/Workspace"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { TeamTable } from "@/components/team-table"
import { UnitTeamFilters } from "@/components/unit-team-filters"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function UnitTeamPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/team">) {
  const { workspaceId, unitId } = await params
  const query = parseUnitTeamListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "team", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()
  const unitObjectId = new Types.ObjectId(unitId)

  // Parte do workspace para garantir o acesso. Só quem foi vinculado (no formulário da
  // unidade), por nome.
  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { name: string } | null
    members: (UnitTeamListItem & { commissionBase: CommissionBase })[]
    roles: RoleOption[]
  }>([
    ...access,
    rolesLookup(),
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: unitObjectId } }, { $project: { _id: 0, name: 1 } }],
      },
    },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          {
            $match: { "units.unitId": unitObjectId },
          },
          ...memberAttendsStages(),
          ...memberRoleNameStages(),
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $set: { user: { $first: "$user" } } },
          {
            $set: {
              link: {
                $first: {
                  $filter: { input: { $ifNull: ["$units", []] }, cond: { $eq: ["$$this.unitId", unitObjectId] } },
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              admin: { $eq: ["$admin", true] },
              roleId: { $ifNull: [{ $toString: "$roleId" }, null] },
              roleName: 1,
              // Vínculo antigo, sem base guardada: a da função.
              commissionBase: { $ifNull: ["$link.commissionBase", { $cond: ["$attends", "services", "gross"] }] },
              email: { $ifNull: ["$user.email", "$email"] },
              name: { $ifNull: ["$user.name", null] },
              image: { $ifNull: ["$user.image", null] },
              pending: { $eq: [{ $ifNull: ["$userId", null] }, null] },
              commissionPercent: { $ifNull: ["$link.commissionPercent", null] },
              salaryCents: { $ifNull: ["$link.salaryCents", null] },
              bonuses: { $ifNull: ["$link.bonuses", []] },
              startDate: { $ifNull: ["$link.startDate", null] },
              payDay: { $ifNull: ["$link.payDay", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] }, members: 1, roles: 1 } },
  ])
  if (!workspace?.unit) notFound()
  const { actor, unit } = workspace
  const members = workspace.members.map((member) => ({ ...member, unitId, unitName: unit.name }))
  // Busca, filtros e paginação são feitos aqui (poucas pessoas por unidade).
  const result = unitTeamListPage(members, query)

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/team`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = query
  // Página além da última (ex.: depois de desvincular a última pessoa dela) vai para a última.
  const pages = Math.ceil(result.total / UNIT_TEAM_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold tracking-tight">Equipe</h3>
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
        emptyText={
          members.length === 0
            ? "Ninguém trabalha nesta unidade ainda. Escolha a equipe ao editar a unidade."
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
