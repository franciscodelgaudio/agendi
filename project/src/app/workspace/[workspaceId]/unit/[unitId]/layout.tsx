import { Suspense } from "react"
import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { UnitSetupNotices } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-nav"

export default async function UnitLayout({
  children,
  params,
}: LayoutProps<"/workspace/[workspaceId]/unit/[unitId]">) {
  const { workspaceId, unitId } = await params

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Suspense fallback={null}>
        <UnitNotices workspaceId={workspaceId} unitId={unitId} />
      </Suspense>
      {children}
    </div>
  )
}

async function UnitNotices({ workspaceId, unitId }: { workspaceId: string; unitId: string }) {
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { name: string; hasServices: boolean; hasWallet: boolean } | null
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $lookup: {
              from: "services",
              localField: "_id",
              foreignField: "unitId",
              as: "services",
              pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              name: 1,
              hasServices: { $gt: [{ $size: "$services" }, 0] },
              hasWallet: { $ne: [{ $ifNull: ["$walletId", null] }, null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  const unit = workspace?.unit
  if (!unit) notFound()

  return (
    <>
      <UnitSetupNotices
      workspaceId={workspaceId}
      unitId={unitId}
      missingServices={!unit.hasServices}
      missingWallet={!unit.hasWallet}
      canManageServices={can(workspace.actor, "services.manage")}
      canManageUnit={can(workspace.actor, "units.manage")}
      />
    </>
  )
}
