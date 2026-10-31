import { notFound } from "next/navigation"
import { isObjectIdOrHexString } from "mongoose"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { AppointmentCalendar } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-calendar"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"

export default async function UnitCalendarPage({ params }: PageProps<"/workspace/[workspaceId]/unit/[unitId]/calendar">) {
  const { workspaceId, unitId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { unit: "calendar", unitId })
  if (!isObjectIdOrHexString(unitId)) notFound()
  const options = await loadCalendarOptions(workspaceId, unitId)
  if (!options.units.length) notFound()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Agenda</h3>
        <CalendarNav base={`/workspace/${workspaceId}/unit/${unitId}/calendar`} />
      </div>
      <div data-tour="unit-calendar">
        <AppointmentCalendar
          workspaceId={workspaceId}
          canSchedule={can(actor, "bookings.manage")}
          canAttend={can(actor, "appointments.manage")}
          unitId={unitId}
          {...options}
        />
      </div>
    </div>
  )
}
