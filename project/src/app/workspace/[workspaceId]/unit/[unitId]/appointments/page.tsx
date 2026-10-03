import Link from "@/components/shared/link"
import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { ArrowRightIcon, CircleCheckIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import {
  APPOINTMENT_PAGE_SIZE,
  appointmentSearchPipeline,
  BRT_OFFSET_HOURS,
  parseAppointmentListQuery,
  type AppointmentPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Workspace } from "@/models/Workspace"
import { AppointmentTable, type AppointmentRow } from "@/components/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-table"
import { CreateAppointmentSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/appointments/create-appointment-sheet"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListTotals } from "@/components/shared/list-totals"
import { PeriodFilter } from "@/components/shared/period-filter"
import { TherapistFilter } from "@/components/workspace/[workspaceId]/shared/team/therapist-filter"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type ServiceOption = { id: string; name: string; priceCents: number; durationMinutes: number; productIds: string[] }
type TherapistOption = { id: string; name: string; image: string | null }

// Todos os atendimentos de uma unidade, em lista, com busca e filtros.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function AppointmentsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/appointments">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  // A unidade vem da rota, não da URL.
  const query = { ...parseAppointmentListQuery(await searchParams, now), unit: "" }
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "appointments", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace -> unidade -> atendimentos para que o acesso seja garantido em cada nível.
  // Serviços da unidade e quem pode atender alimentam o formulário; o total sem busca nem
  // filtros separa "sem atendimentos" de "filtro sem resultado".
  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    therapists: TherapistOption[]
    unit: { appointments: AppointmentPage<AppointmentRow>; total: number; services: ServiceOption[] } | null
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
              from: "appointments",
              localField: "_id",
              foreignField: "unitId",
              as: "appointments",
              pipeline: appointmentSearchPipeline(query),
            },
          },
          {
            $lookup: {
              from: "appointments",
              localField: "_id",
              foreignField: "unitId",
              as: "total",
              pipeline: [{ $count: "n" }],
            },
          },
          {
            $lookup: {
              from: "services",
              localField: "_id",
              foreignField: "unitId",
              as: "services",
              pipeline: [
                { $sort: { name: 1, _id: 1 } },
                { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, priceCents: 1, durationMinutes: 1, productIds: { $map: { input: "$productIds", as: "id", in: { $toString: "$$id" } } } } },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              appointments: { $first: "$appointments" },
              services: 1,
              total: { $ifNull: [{ $first: "$total.n" }, 0] },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    {
      $project: {
        _id: 0,
        actor: 1,
        therapists: 1,
        unit: { $ifNull: [{ $first: "$unit" }, null] },
      },
    },
  ])
  if (!workspace?.unit) notFound()
  const { appointments: result, total, services } = workspace.unit
  const { therapists } = workspace
  const canManage = can(workspace.actor, "appointments.manage")

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/appointments`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...parsed } = query
  // Hora atual de Brasília.
  const defaultPerformedAt = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 16)
  // O padrão (hoje) fica fora dos links, para que a lista acompanhe a virada do dia.
  const today = defaultPerformedAt.slice(0, 10)
  const isToday = !parsed.period && parsed.from === today && parsed.to === today
  const filters = isToday ? { ...parsed, from: "", to: "" } : parsed
  // Página além da última (ex.: depois de excluir o último atendimento dela) vai para a última.
  const pages = Math.ceil(result.total / APPOINTMENT_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }
  // O proprietário sempre está entre quem pode atender, então basta haver serviço.
  const createButton = canManage && services.length > 0 && (
    <CreateAppointmentSheet
      workspaceId={workspaceId}
      unitId={unitId}
      services={services}
      therapists={therapists}
      defaultPerformedAt={defaultPerformedAt}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Atendimentos</h3>
        {/* O botão sobe para o título: com muitos filtros, a linha deles quebra sozinha. */}
        {total > 0 && createButton}
      </div>

      {total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum atendimento</EmptyTitle>
            <EmptyDescription>
              {!canManage
                ? "Os atendimentos registrados nesta unidade aparecerão aqui."
                : !services.length
                  ? "Cadastre os serviços da unidade antes de registrar atendimentos."
                  : "Registre os atendimentos com o hóspede, os serviços e os profissionais."}
            </EmptyDescription>
          </EmptyHeader>
          {createButton && <EmptyContent>{createButton}</EmptyContent>}
          {canManage && !services.length && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href={`/workspace/${workspaceId}/unit/${unitId}/services`} />}>
                Cadastrar serviços
                <ArrowRightIcon />
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={filters} placeholder="Buscar hóspede, quarto, profissional ou serviço..." />
            <TherapistFilter query={filters} therapists={therapists} />
            <PeriodFilter query={filters} today={today} />
            <ListTotals items={[{ label: "Total", cents: result.totalCents }]} />
          </div>
          <AppointmentTable
            appointments={result.rows}
            query={filters}
            pathname={pathname}
            workspaceId={workspaceId}
            options={{ services, therapists }}
            canManage={canManage}
          />
          <ListPagination
            query={filters}
            page={page}
            pageSize={APPOINTMENT_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="atendimentos"
          />
        </>
      )}
    </div>
  )
}
