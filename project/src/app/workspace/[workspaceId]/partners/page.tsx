import { notFound, redirect } from "next/navigation"
import { HandshakeIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import {
  PARTNER_PAGE_SIZE,
  parsePartnerListQuery,
  partnerListPipeline,
} from "@/service/workspace/[workspaceId]/partners/partner-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { PageHeader } from "@/components/shared/page-header"
import { QuerySelect } from "@/components/shared/query-select"
import { PartnerCards } from "@/components/workspace/[workspaceId]/partners/partner-cards"
import { CreatePartnerButton, type PartnerRow } from "@/components/workspace/[workspaceId]/partners/partner-sheets"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Partner } from "@/models/Partner"
import { Workspace } from "@/models/Workspace"

export default async function PartnersPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/partners">) {
  const { workspaceId } = await params
  const query = parsePartnerListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    partnerCount: number
    units: { id: string; name: string; hasPartner: boolean }[]
  }>([
    ...access,
    {
      $lookup: {
        from: "partners",
        localField: "_id",
        foreignField: "workspaceId",
        as: "partners",
        pipeline: [{ $project: { _id: 1 } }],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          { $lookup: { from: "partners", localField: "_id", foreignField: "unitId", as: "partner", pipeline: [{ $limit: 1 }] } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, hasPartner: { $gt: [{ $size: "$partner" }, 0] } } },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, actor: 1, units: 1, partnerCount: { $size: "$partners" } } },
  ])
  if (!workspace) notFound()

  const [result = { rows: [], total: 0 }] = await Partner.aggregate<{ rows: PartnerRow[]; total: number }>(
    partnerListPipeline(workspace.id, query),
  )
  const pathname = `/workspace/${workspaceId}/partners`
  const listQuery = { q: query.q, unit: query.unit }
  const pages = Math.ceil(result.total / PARTNER_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }

  const canManage = can(workspace.actor, "partners.manage")
  const freeUnits = workspace.units.filter((unit) => !unit.hasPartner).map(({ id, name }) => ({ id, name }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title="Parceiros" />

      {workspace.partnerCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandshakeIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum parceiro cadastrado</EmptyTitle>
            <EmptyDescription>
              Cadastre um parceiro quando uma unidade funciona no espaço de outro estabelecimento que fica com uma parte do
              faturamento.
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreatePartnerButton workspaceId={workspaceId} units={freeUnits} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ListToolbar actions={canManage && <CreatePartnerButton workspaceId={workspaceId} units={freeUnits} />}>
            <ListSearch query={listQuery} placeholder="Buscar parceiro..." />
            <QuerySelect
              query={listQuery}
              field="unit"
              label="Unidade"
              items={[
                { value: "all", label: "Com e sem unidade" },
                { value: "linked", label: "Com unidade" },
                { value: "unlinked", label: "Sem unidade" },
              ]}
            />
          </ListToolbar>
          <PartnerCards workspaceId={workspaceId} partners={result.rows} freeUnits={freeUnits} canManage={canManage} />
          <ListPagination
            query={listQuery}
            page={query.page}
            pageSize={PARTNER_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="parceiros"
          />
        </>
      )}
    </div>
  )
}
