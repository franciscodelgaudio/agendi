import { notFound } from "next/navigation"
import { isObjectIdOrHexString } from "mongoose"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadCalendarAppointments, loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { AppointmentCalendar } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-calendar"
import { PageHeader } from "@/components/shared/page-header"

export default async function UnitCalendarPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/unit/[unitId]/calendar">) {
  const { workspaceId, unitId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { unit: "calendar", unitId })
  if (!isObjectIdOrHexString(unitId)) notFound()
  const [options, calendar] = await Promise.all([
    loadCalendarOptions(workspaceId, unitId),
    loadCalendarAppointments(workspaceId, await searchParams, unitId),
  ])
  if (!options.units.length) notFound()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Agenda" />
      <AppointmentCalendar
        workspaceId={workspaceId}
        canSchedule={can(actor, "bookings.manage")}
        canAttend={can(actor, "appointments.manage")}
        unitId={unitId}
        {...options}
        {...calendar}
      />
    </div>
  )
}
