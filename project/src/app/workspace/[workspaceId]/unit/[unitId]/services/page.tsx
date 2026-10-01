import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { LeafIcon } from "lucide-react"
import { can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { parseServiceListQuery, serviceListPipeline } from "@/lib/service-list"
import { Workspace } from "@/models/Workspace"
import { CreateServiceSheet } from "@/components/create-service-sheet"
import { ListSearch } from "@/components/list-search"
import { ServiceTable } from "@/components/service-table"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type ServiceRow = { id: string; name: string; priceCents: number; durationMinutes: number; productIds: string[] }

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ServicesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/services">) {
  const { workspaceId, unitId } = await params
  const query = parseServiceListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "services", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace -> unidade -> serviços para que o acesso seja garantido em cada nível.
  // O total sem filtro separa "unidade sem serviços" de "busca sem resultado".
  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { services: ServiceRow[]; serviceCount: number } | null
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $lookup: {
              from: "services",
              localField: "_id",
              foreignField: "unitId",
              as: "services",
              pipeline: serviceListPipeline(query),
            },
          },
          {
            $lookup: {
              from: "services",
              localField: "_id",
              foreignField: "unitId",
              as: "serviceCount",
              pipeline: [{ $count: "n" }],
            },
          },
          {
            $project: {
              _id: 0,
              services: 1,
              serviceCount: { $ifNull: [{ $first: "$serviceCount.n" }, 0] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { services, serviceCount } = workspace.unit
  const canManage = can(workspace.actor, "services.manage")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Serviços</h3>
        {canManage && serviceCount > 0 && <CreateServiceSheet workspaceId={workspaceId} unitId={unitId} />}
      </div>
      {serviceCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LeafIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum serviço cadastrado</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Cadastre os serviços prestados nesta unidade, com valor e duração média. Eles são a base dos agendamentos, atendimentos e do caixa."
                : "Esta unidade ainda não tem serviços cadastrados."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreateServiceSheet workspaceId={workspaceId} unitId={unitId} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ListSearch query={query} placeholder="Buscar serviço..." />
          <ServiceTable
            services={services}
           
            query={query}
            pathname={`/workspace/${workspaceId}/unit/${unitId}/services`}
            workspaceId={workspaceId}
            unitId={unitId}
            canManage={canManage}
          />
        </>
      )}
    </div>
  )
}
