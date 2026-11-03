import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadCalendarAppointments, loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { AppointmentCalendar } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-calendar"
import { PageHeader } from "@/components/shared/page-header"

export default async function CalendarPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/calendar">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "calendar" })
  const [options, calendar] = await Promise.all([
    loadCalendarOptions(workspaceId),
    loadCalendarAppointments(workspaceId, await searchParams),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title="Agenda" />
      <AppointmentCalendar
        workspaceId={workspaceId}
        canSchedule={can(actor, "bookings.manage")}
        canAttend={can(actor, "appointments.manage")}
        {...options}
        {...calendar}
      />
    </div>
  )
}
