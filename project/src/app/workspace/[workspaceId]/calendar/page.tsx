import { notFound } from "next/navigation"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { therapistOptionsStages } from "@/lib/therapist"
import { Workspace } from "@/models/Workspace"
import { BookingCalendar, type BookingOptions } from "@/components/booking-calendar"
import { CalendarNav } from "@/components/calendar-nav"

// Agenda de todas as unidades do workspace. Os agendamentos são buscados pelo próprio
// calendário, conforme o período visível; aqui vêm só as opções dos filtros e do formulário.
export default async function CalendarPage({ params }: PageProps<"/workspace/[workspaceId]/calendar">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "calendar" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<BookingOptions & { role: WorkspaceRole }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { name: 1, treatmentRooms: 1 } }],
      },
    },
    {
      $lookup: {
        from: "services",
        localField: "units._id",
        foreignField: "unitId",
        as: "services",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              unitId: { $toString: "$unitId" },
              name: 1,
              priceCents: 1,
              durationMinutes: 1,
              productIds: { $map: { input: "$productIds", as: "id", in: { $toString: "$$id" } } },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    {
      $project: {
        _id: 0,
        role: 1,
        units: { $map: { input: "$units", as: "unit", in: { id: { $toString: "$$unit._id" }, name: "$$unit.name" } } },
        services: 1,
        // Salas de todas as unidades, cada uma com a sua unidade.
        treatmentRooms: {
          $reduce: {
            input: "$units",
            initialValue: [],
            in: {
              $concatArrays: [
                "$$value",
                {
                  $map: {
                    input: "$$this.treatmentRooms",
                    as: "room",
                    in: {
                      id: { $toString: "$$room._id" },
                      unitId: { $toString: "$$this._id" },
                      name: "$$room.name",
                      beds: "$$room.beds",
                    },
                  },
                },
              ],
            },
          },
        },
        therapists: 1,
      },
    },
  ])
  if (!workspace) notFound()
  const { role, ...options } = workspace

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Calendário</h2>
        <CalendarNav base={`/workspace/${workspaceId}/calendar`} />
      </div>
      <BookingCalendar workspaceId={workspaceId} canManage={canManageMembers(role)} {...options} />
    </div>
  )
}
