import { notFound } from "next/navigation"
import { isObjectIdOrHexString } from "mongoose"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { parseAppointmentListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { loadCalendarOptions } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { AppointmentListView } from "@/components/workspace/[workspaceId]/shared/calendar/list/appointment-list-view"

export default async function UnitAppointmentsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/appointments">) {
  const { workspaceId, unitId } = await params
  const search = await searchParams
  const query = parseAppointmentListQuery({ status: "done", ...search })
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { unit: "appointments", unitId })
  if (!isObjectIdOrHexString(unitId)) notFound()
  const options = await loadCalendarOptions(workspaceId, unitId)
  if (!options.units.length) notFound()

  return (
    <div className="flex flex-col gap-4">
      <AppointmentListView
        workspaceId={workspaceId}
        unitId={unitId}
        query={query}
        pathname={`/workspace/${workspaceId}/unit/${unitId}/appointments`}
        options={options}
        permissions={{ canSchedule: can(actor, "bookings.manage"), canAttend: can(actor, "appointments.manage") }}
        header={() => <h3 className="text-lg font-semibold tracking-tight">Atendimentos</h3>}
      />
    </div>
  )
}
