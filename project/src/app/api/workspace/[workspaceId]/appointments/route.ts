import { Types } from "mongoose"
import { calendarPipeline, parseCalendarRange, type AppointmentRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-guard"
import { getSessionUserId } from "@/service/(auth)/session"
import { Appointment } from "@/models/Appointment"

export async function GET(request: Request, { params }: RouteContext<"/api/workspace/[workspaceId]/appointments">) {
  const { workspaceId } = await params
  const userId = await getSessionUserId()
  if (!userId) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 })
  const range = parseCalendarRange(Object.fromEntries(new URL(request.url).searchParams))
  if (!range) return Response.json({ error: "Período inválido." }, { status: 400 })
  const visible = await findVisiblePages(workspaceId, userId)
  if (!visible) return Response.json({ error: "Workspace não encontrado." }, { status: 404 })
  if (!visible.pages.workspace.includes("calendar") && !(range.unit && visible.pages.unit.includes("calendar"))) {
    return Response.json({ error: "Sem permissão para ver a agenda." }, { status: 403 })
  }

  const appointments = await Appointment.aggregate<AppointmentRow>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId) } },
    ...calendarPipeline(range),
  ])
  return Response.json({ appointments })
}
