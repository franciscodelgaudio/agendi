import { redirect } from "next/navigation"
import { Types } from "mongoose"
import { requireUser } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

export default async function Home() {
  const user = await requireUser()

  const memberOf = await WorkspaceMember.distinct("workspaceId", { userId: new Types.ObjectId(user.id) })
  const [workspace] = await Workspace.aggregate<{ id: string }>([
    { $match: { _id: { $in: memberOf } } },
    { $sort: { createdAt: 1 } },
    { $limit: 1 },
    { $project: { _id: 0, id: { $toString: "$_id" } } },
  ])

  redirect(workspace ? `/workspace/${workspace.id}` : "/onboarding")
}
