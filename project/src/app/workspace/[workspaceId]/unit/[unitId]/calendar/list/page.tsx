import { notFound } from "next/navigation"
import { isObjectIdOrHexString } from "mongoose"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { parseAppointmentListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"
import { AppointmentListView } from "@/components/workspace/[workspaceId]/shared/calendar/list/appointment-list-view"

export default async function UnitCalendarListPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/calendar/list">) {
  const { workspaceId, unitId } = await params
  const query = parseAppointmentListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { unit: "calendar", unitId })
  if (!isObjectIdOrHexString(unitId)) notFound()
  const options = await loadCalendarOptions(workspaceId, unitId)
  if (!options.units.length) notFound()
  const base = `/workspace/${workspaceId}/unit/${unitId}/calendar`

  return (
    <div className="flex flex-col gap-4">
      <AppointmentListView
        workspaceId={workspaceId}
        unitId={unitId}
        query={query}
        pathname={`${base}/list`}
        options={options}
        permissions={{ canSchedule: can(actor, "bookings.manage"), canAttend: can(actor, "appointments.manage") }}
        header={(createButton) => (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-lg font-semibold tracking-tight">Agenda</h3>
            <div className="flex items-center gap-2">
              {createButton}
              <CalendarNav base={base} />
            </div>
          </div>
        )}
      />
    </div>
  )
}
