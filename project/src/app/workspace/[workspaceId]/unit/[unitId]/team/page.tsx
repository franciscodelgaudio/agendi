import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { canManageMembers, type WorkspaceRole } from "@/lib/member-role"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseUnitTeamListQuery, UNIT_TEAM_PAGE_SIZE, unitTeamListPage, type UnitTeamListItem } from "@/lib/unit-team-list"
import { Workspace } from "@/models/Workspace"
import { UserIcon } from "lucide-react"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { CodeCell, CodeHead } from "@/components/record-code"
import { SortableHead } from "@/components/sortable-head"
import { UnitTeamFilters } from "@/components/unit-team-filters"
import { roleLabels } from "@/components/role-labels"
import { UnitMemberActions } from "@/components/unit-member-actions"
import { currencyFormat } from "@/components/service-format"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function payParts({ commissionPercent, salaryCents, bonuses }: UnitTeamListItem) {
  const parts: string[] = []
  if (commissionPercent !== null) parts.push(`${percentFormat.format(commissionPercent)}% de comissão`)
  if (salaryCents !== null) parts.push(`${currencyFormat.format(salaryCents / 100)}/mês`)
  if (bonuses.length > 0) parts.push(bonuses.length === 1 ? "1 bônus" : `${bonuses.length} bônus`)
  return parts
}

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

  // Parte do workspace para garantir o acesso. Só massagistas e recepcionistas vinculadas
  // (no formulário da unidade), por nome.
  const [workspace] = await Workspace.aggregate<{
    role: WorkspaceRole
    unit: { name: string } | null
    members: UnitTeamListItem[]
  }>([
    ...access,
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
            $match: {
              role: { $in: ["massage_therapist", "receptionist"] },
              "units.unitId": unitObjectId,
            },
          },
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
              role: 1,
              email: { $ifNull: ["$user.email", "$email"] },
              name: { $ifNull: ["$user.name", null] },
              image: { $ifNull: ["$user.image", null] },
              pending: { $eq: [{ $ifNull: ["$userId", null] }, null] },
              commissionPercent: { $ifNull: ["$link.commissionPercent", null] },
              salaryCents: { $ifNull: ["$link.salaryCents", null] },
              bonuses: { $ifNull: ["$link.bonuses", []] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, role: 1, unit: { $ifNull: [{ $first: "$unit" }, null] }, members: 1 } },
  ])
  if (!workspace?.unit) notFound()
  const { role, unit, members } = workspace
  const canManage = canManageMembers(role)
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
          <UnitTeamFilters query={filters} />
        </div>
      )}
      <div className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <CodeHead className="@max-3xl:hidden" />
              {/* Só há ordenação por nome; o sort fixo alimenta o cabeçalho e é ignorado na leitura. */}
              <SortableHead
                field="name"
                label="Nome"
                icon={UserIcon}
                query={{ ...filters, sort: "name" }}
                pathname={pathname}
                className="w-full"
              />
              <TableHead className="px-4">Função</TableHead>
              <TableHead className="px-4 text-right @max-xl:hidden">Remuneração</TableHead>
              {canManage && <TableHead className="w-0 px-4 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">
                  {members.length === 0
                    ? "Ninguém trabalha nesta unidade ainda. Escolha a equipe ao editar a unidade."
                    : "Ninguém encontrado."}
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((member) => {
                const label = member.name ?? member.email
                const isTherapist = member.role === "massage_therapist"
                // Só o proprietário define a remuneração de massagistas.
                const canEdit = canManage && (!isTherapist || role === "owner")
                return (
                  <TableRow key={member.id}>
                    <CodeCell id={member.id} className="@max-3xl:hidden" />
                    <TableCell className="max-w-0 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          {member.image && <AvatarImage src={member.image} alt={label} />}
                          <InitialFallback name={label} />
                        </Avatar>
                        <div className="grid min-w-0">
                          <span className="truncate font-medium">{label}</span>
                          {member.name && <span className="truncate text-xs text-muted-foreground">{member.email}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{roleLabels[member.role]}</Badge>
                        {member.pending && <Badge variant="outline">Convite pendente</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums @max-xl:hidden">
                      {payParts(member).join(" + ") || <span className="text-muted-foreground">Não definida</span>}
                    </TableCell>
                    {canManage && (
                      <TableCell className="px-4 text-right">
                        {canEdit && (
                          <UnitMemberActions
                            workspaceId={workspaceId}
                            unitId={unitId}
                            unitName={unit.name}
                            member={{
                              id: member.id,
                              label,
                              role: member.role,
                              commissionPercent: member.commissionPercent,
                              salaryCents: member.salaryCents,
                              bonuses: member.bonuses,
                            }}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={filters}
        page={page}
        pageSize={UNIT_TEAM_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="pessoas"
      />
      {role === "admin" && (
        <p className="text-sm text-muted-foreground">Só o proprietário define a remuneração de massagistas.</p>
      )}
    </div>
  )
}
