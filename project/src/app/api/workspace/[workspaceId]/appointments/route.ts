import { Types } from "mongoose"
import {
  calendarPipeline,
  parseCalendarRange,
  therapistBlockListPipeline,
  type AppointmentRow,
  type TherapistBlockRow,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-guard"
import { getSessionUserId } from "@/service/(auth)/session"
import { Appointment } from "@/models/Appointment"
import { TherapistBlock } from "@/models/TherapistBlock"

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

  const workspaceMatch = { $match: { workspaceId: new Types.ObjectId(workspaceId) } }
  const [appointments, blocks] = await Promise.all([
    Appointment.aggregate<AppointmentRow>([workspaceMatch, ...calendarPipeline(range)]),
    TherapistBlock.aggregate<TherapistBlockRow>([workspaceMatch, ...therapistBlockListPipeline(range)]),
  ])
  return Response.json({ appointments, blocks })
}
