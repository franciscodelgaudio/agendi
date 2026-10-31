import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { parseAppointmentListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"
import { AppointmentListView } from "@/components/workspace/[workspaceId]/shared/calendar/list/appointment-list-view"

export default async function CalendarListPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/calendar/list">) {
  const { workspaceId } = await params
  const query = parseAppointmentListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "calendar" })
  const options = await loadCalendarOptions(workspaceId)
  const base = `/workspace/${workspaceId}/calendar`

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <AppointmentListView
        workspaceId={workspaceId}
        query={query}
        pathname={`${base}/list`}
        options={options}
        permissions={{ canSchedule: can(actor, "bookings.manage"), canAttend: can(actor, "appointments.manage") }}
        header={(createButton) => (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
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
