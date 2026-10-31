import { redirect } from "next/navigation"
import { Types } from "mongoose"
import { CalendarIcon } from "lucide-react"
import {
  APPOINTMENT_PAGE_SIZE,
  appointmentListPipeline,
  type AppointmentListQuery,
  type AppointmentPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import type { CalendarOptionsData } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { PeriodFilter } from "@/components/shared/period-filter"
import { BookingStatusFilter } from "@/components/workspace/[workspaceId]/shared/calendar/booking-status-filter"
import { UnitFilter } from "@/components/workspace/[workspaceId]/shared/calendar/unit-filter"
import { CreateAppointmentSheet } from "@/components/workspace/[workspaceId]/shared/calendar/create-appointment-sheet"
import { AppointmentTable } from "@/components/workspace/[workspaceId]/shared/calendar/list/appointment-table"
import type { AppointmentPermissions } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-actions"
import { TherapistFilter } from "@/components/workspace/[workspaceId]/shared/team/therapist-filter"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Appointment } from "@/models/Appointment"

const HOUR_MS = 60 * 60 * 1000

export async function AppointmentListView({
  workspaceId,
  unitId,
  query,
  pathname,
  options,
  permissions,
  header,
}: {
  workspaceId: string
  unitId?: string
  query: AppointmentListQuery
  pathname: string
  options: CalendarOptionsData
  permissions: AppointmentPermissions
  header: (createButton: React.ReactNode) => React.ReactNode
}) {
  const scoped = { ...query, unit: unitId ?? query.unit }
  const [[result], hasAny] = await Promise.all([
    Appointment.aggregate<AppointmentPage>([
      { $match: { workspaceId: new Types.ObjectId(workspaceId) } },
      ...appointmentListPipeline(scoped),
    ]),
    Appointment.exists({ workspaceId: new Types.ObjectId(workspaceId), ...(unitId && { unitId: new Types.ObjectId(unitId) }) }),
  ])
  const { page, ...rest } = query
  const filters = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, String(value)])) as Omit<
    AppointmentListQuery,
    "page"
  > &
    Record<string, string>
  const pages = Math.ceil(result.total / APPOINTMENT_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...filters, page: String(pages) }).filter(([, v]) => v))}`)
  }
  const now = new Date()
  const defaultStartsAt = new Date(Math.ceil((now.getTime() - BRT_OFFSET_HOURS * HOUR_MS) / HOUR_MS) * HOUR_MS)
    .toISOString()
    .slice(0, 16)
  const formOptions = { ...options, units: unitId ? undefined : options.units }
  const createButton = permissions.canSchedule && options.units.length > 0 && options.services.length > 0 && (
    <CreateAppointmentSheet
      workspaceId={workspaceId}
      unitId={unitId}
      memberId={query.member}
      defaultStartsAt={defaultStartsAt}
      {...options}
    />
  )

  return (
    <>
      {header(hasAny ? createButton : null)}
      {!hasAny ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum agendamento</EmptyTitle>
            <EmptyDescription>
              {!permissions.canSchedule
                ? "Os agendamentos aparecerão aqui."
                : !options.units.length
                  ? "Cadastre uma unidade antes de criar agendamentos."
                  : !options.services.length
                    ? "Cadastre um serviço antes de criar agendamentos."
                    : "Agende escolhendo o cliente, o serviço, a profissional, a estação e o horário."}
            </EmptyDescription>
          </EmptyHeader>
          {createButton && <EmptyContent>{createButton}</EmptyContent>}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={filters} placeholder="Buscar cliente, serviço ou profissional..." />
            {!unitId && <UnitFilter query={filters} units={options.units} />}
            <TherapistFilter query={filters} therapists={options.therapists} />
            <BookingStatusFilter query={filters} />
            <PeriodFilter query={filters} />
          </div>
          <AppointmentTable
            appointments={result.rows}
            query={filters}
            pathname={pathname}
            workspaceId={workspaceId}
            options={formOptions}
            permissions={permissions}
          />
          <ListPagination
            query={filters}
            page={page}
            pageSize={APPOINTMENT_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="agendamentos"
          />
        </>
      )}
    </>
  )
}
