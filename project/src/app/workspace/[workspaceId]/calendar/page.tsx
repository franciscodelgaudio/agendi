import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { AppointmentCalendar } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-calendar"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"

export default async function CalendarPage({ params }: PageProps<"/workspace/[workspaceId]/calendar">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "calendar" })
  const options = await loadCalendarOptions(workspaceId)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
        <CalendarNav base={`/workspace/${workspaceId}/calendar`} />
      </div>
      <AppointmentCalendar
        workspaceId={workspaceId}
        canSchedule={can(actor, "bookings.manage")}
        canAttend={can(actor, "appointments.manage")}
        {...options}
      />
    </div>
  )
}
