import { notFound, redirect } from "next/navigation"
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
import { UnitFilter } from "@/components/workspace/[workspaceId]/shared/calendar/unit-filter"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

const HOUR_MS = 60 * 60 * 1000

// Todos os agendamentos das unidades do workspace, em lista, com busca e filtros.
export default async function CalendarListPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/calendar/list">) {
  const { workspaceId } = await params
  const now = new Date()
  const query = parseBookingListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "calendar" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Parte do workspace -> unidades -> agendamentos/serviços, então só entram unidades do
  // workspace. O total sem busca nem filtros separa "sem agendamentos" de "filtro sem resultado".
  const [workspace] = await Workspace.aggregate<BookingOptions & {
    actor: Actor
    bookings: BookingPage
    total: number
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { name: 1, treatmentRooms: 1 } }],
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "units._id",
        foreignField: "unitId",
        as: "bookings",
        pipeline: bookingSearchPipeline(query),
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "units._id",
        foreignField: "unitId",
        as: "total",
        pipeline: [{ $count: "n" }],
      },
    },
    {
      $lookup: {
        from: "services",
        localField: "units._id",
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
    ...therapistOptionsStages(),
    {
      $project: {
        _id: 0,
        actor: 1,
        units: { $map: { input: "$units", as: "unit", in: { id: { $toString: "$$unit._id" }, name: "$$unit.name" } } },
        bookings: { $first: "$bookings" },
        total: { $ifNull: [{ $first: "$total.n" }, 0] },
        services: 1,
        // Salas de todas as unidades, cada uma com a sua unidade.
        treatmentRooms: {
          $reduce: {
            input: "$units",
            initialValue: [],
            in: {
              $concatArrays: [
                "$$value",
                {
                  $map: {
                    input: "$$this.treatmentRooms",
                    as: "room",
                    in: {
                      id: { $toString: "$$room._id" },
                      unitId: { $toString: "$$this._id" },
                      name: "$$room.name",
                      beds: "$$room.beds",
                    },
                  },
                },
              ],
            },
          },
        },
        therapists: 1,
      },
    },
  ])
  if (!workspace) notFound()
  const { actor, bookings: result, total, ...options } = workspace
  const canManage = can(actor, "bookings.manage")

  const base = `/workspace/${workspaceId}/calendar`
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

  // O proprietário sempre está entre os profissionais, então basta haver uma unidade.
  const createButton = canManage && options.units.length > 0 && (
    <CreateBookingSheet
      workspaceId={workspaceId}
      therapistId={query.therapist}
      defaultStartsAt={defaultStartsAt}
      {...options}
    />
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
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
              {!canManage
                ? "Os agendamentos das unidades aparecerão aqui."
                : !options.units.length
                  ? "Cadastre uma unidade antes de criar agendamentos."
                  : "Agende escolhendo o profissional, a unidade, o serviço, o hóspede e o horário."}
            </EmptyDescription>
          </EmptyHeader>
          {createButton && <EmptyContent>{createButton}</EmptyContent>}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={filters} placeholder="Buscar hóspede, quarto, profissional ou serviço..." />
            <UnitFilter query={filters} units={options.units} />
            <TherapistFilter query={filters} therapists={options.therapists} />
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
