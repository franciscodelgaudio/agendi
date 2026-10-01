import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { Workspace } from "@/models/Workspace"
import { BookingCalendar, type BookingOptions } from "@/components/workspace/[workspaceId]/shared/calendar/booking-calendar"
import { CalendarNav } from "@/components/workspace/[workspaceId]/shared/calendar/calendar-nav"

// Agenda de uma unidade: o mesmo calendário do workspace, fixo nesta unidade.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function UnitCalendarPage({ params }: PageProps<"/workspace/[workspaceId]/unit/[unitId]/calendar">) {
  const { workspaceId, unitId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "calendar", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace -> unidade -> serviços para que o acesso seja garantido em cada nível.
  const [workspace] = await Workspace.aggregate<Omit<BookingOptions, "units"> & {
    actor: Actor
    unit: { id: string; name: string } | null
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: new Types.ObjectId(unitId) } }, { $project: { name: 1, treatmentRooms: 1 } }],
      },
    },
    {
      $lookup: {
        from: "services",
        localField: "unit._id",
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
        actor: 1,
        unit: {
          $let: {
            vars: { unit: { $first: "$unit" } },
            in: { $cond: ["$$unit", { id: { $toString: "$$unit._id" }, name: "$$unit.name" }, null] },
          },
        },
        services: 1,
        treatmentRooms: {
          $map: {
            input: { $ifNull: [{ $first: "$unit.treatmentRooms" }, []] },
            as: "room",
            in: { id: { $toString: "$$room._id" }, unitId, name: "$$room.name", beds: "$$room.beds" },
          },
        },
        therapists: 1,
      },
    },
  ])
  if (!workspace?.unit) notFound()
  const { actor, unit, ...options } = workspace

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Agenda</h3>
        <CalendarNav base={`/workspace/${workspaceId}/unit/${unitId}/calendar`} />
      </div>
      <div data-tour="unit-calendar">
        <BookingCalendar
          workspaceId={workspaceId}
          canManage={can(actor, "bookings.manage")}
          unitId={unit.id}
          units={[unit]}
          {...options}
        />
      </div>
    </div>
  )
}
