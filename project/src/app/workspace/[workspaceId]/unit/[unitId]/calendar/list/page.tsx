import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { CalendarIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import {
  BOOKING_PAGE_SIZE,
  bookingSearchPipeline,
  parseBookingListQuery,
  type BookingPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Workspace } from "@/models/Workspace"
import type { BookingOptions } from "@/components/workspace/[workspaceId]/shared/calendar/booking-calendar"
import { BookingTable } from "@/components/workspace/[workspaceId]/shared/calendar/list/booking-table"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"
import { CreateBookingSheet } from "@/components/workspace/[workspaceId]/shared/calendar/create-booking-sheet"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { BookingStatusFilter } from "@/components/workspace/[workspaceId]/shared/calendar/booking-status-filter"
import { PeriodFilter } from "@/components/shared/period-filter"
import { TherapistFilter } from "@/components/workspace/[workspaceId]/shared/team/therapist-filter"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

const HOUR_MS = 60 * 60 * 1000

// Todos os agendamentos de uma unidade, em lista, com busca e filtros.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function UnitCalendarListPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/calendar/list">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  // A unidade vem da rota, não da URL.
  const query = { ...parseBookingListQuery(await searchParams), unit: "" }
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "calendar", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace -> unidade -> agendamentos/serviços para que o acesso seja garantido em
  // cada nível. O total sem busca nem filtros separa "sem agendamentos" de "filtro sem resultado".
  const [workspace] = await Workspace.aggregate<Pick<BookingOptions, "therapists"> & {
    actor: Actor
    unit: {
      bookings: BookingPage
      total: number
      services: BookingOptions["services"]
      treatmentRooms: BookingOptions["treatmentRooms"]
    } | null
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
              from: "bookings",
              localField: "_id",
              foreignField: "unitId",
              as: "bookings",
              pipeline: bookingSearchPipeline(query),
            },
          },
          {
            $lookup: {
              from: "bookings",
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
                {
                  $project: {
                    _id: 0,
                    id: { $toString: "$_id" },
                    unitId: { $toString: "$unitId" },
                    name: 1,
                    priceCents: 1,
                    durationMinutes: 1,
                    productIds: { $map: { input: "$productIds", as: "id", in: { $toString: "$$id" } } },
                  },
                },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              bookings: { $first: "$bookings" },
              services: 1,
              treatmentRooms: {
                $map: {
                  input: "$treatmentRooms",
                  as: "room",
                  in: {
                    id: { $toString: "$$room._id" },
                    unitId: { $toString: "$_id" },
                    name: "$$room.name",
                    beds: "$$room.beds",
                  },
                },
              },
              total: { $ifNull: [{ $first: "$total.n" }, 0] },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    { $project: { _id: 0, actor: 1, therapists: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { bookings: result, total, services, treatmentRooms } = workspace.unit
  const { therapists } = workspace
  const canManage = can(workspace.actor, "bookings.manage")
  const options = { services, therapists, treatmentRooms }

  const base = `/workspace/${workspaceId}/unit/${unitId}/calendar`
  const pathname = `${base}/list`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = query
  const bookings = result.rows
  // Página além da última (ex.: depois de excluir o último agendamento dela) vai para a última.
  const pages = Math.ceil(result.total / BOOKING_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }
  // A próxima hora cheia de Brasília.
  const defaultStartsAt = new Date(Math.ceil((now.getTime() - BRT_OFFSET_HOURS * HOUR_MS) / HOUR_MS) * HOUR_MS)
    .toISOString()
    .slice(0, 16)

  // O proprietário sempre está entre os profissionais, então sempre dá para agendar.
  const createButton = canManage && (
    <CreateBookingSheet
      workspaceId={workspaceId}
      unitId={unitId}
      therapistId={query.therapist}
      defaultStartsAt={defaultStartsAt}
      {...options}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Agenda</h3>
        {/* O botão sobe para o título: com muitos filtros, a linha deles quebra sozinha. */}
        <div className="flex items-center gap-2">
          {total > 0 && createButton}
          <CalendarNav base={base} />
        </div>
      </div>

      {total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum agendamento</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Agende escolhendo o profissional, o serviço, o hóspede e o horário."
                : "Os agendamentos desta unidade aparecerão aqui."}
            </EmptyDescription>
          </EmptyHeader>
          {createButton && <EmptyContent>{createButton}</EmptyContent>}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={filters} placeholder="Buscar hóspede, quarto, profissional ou serviço..." />
            <TherapistFilter query={filters} therapists={therapists} />
            <BookingStatusFilter query={filters} />
            <PeriodFilter query={filters} />
          </div>
          <BookingTable
            bookings={bookings}
            query={filters}
            pathname={pathname}
            workspaceId={workspaceId}
            options={options}
            canManage={canManage}
          />
          <ListPagination
            query={filters}
            page={page}
            pageSize={BOOKING_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="agendamentos"
          />
        </>
      )}
    </div>
  )
}
