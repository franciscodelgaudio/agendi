import { redirect } from "next/navigation"
import { Types } from "mongoose"
import { requireUser } from "@/lib/session"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

// "/" é o destino padrão após login e cadastro: manda para o workspace do
// usuário ou para a criação do primeiro.
export default async function Home() {
  const user = await requireUser()

  // O workspace mais antigo (próprio ou em que é membro) é o padrão.
  const userId = new Types.ObjectId(user.id)
  const memberOf = await WorkspaceMember.distinct("workspaceId", { userId })
  const [workspace] = await Workspace.aggregate<{ id: string }>([
    { $match: { $or: [{ userId }, { _id: { $in: memberOf } }] } },
    { $sort: { createdAt: 1 } },
    { $limit: 1 },
    { $project: { _id: 0, id: { $toString: "$_id" } } },
  ])

  redirect(workspace ? `/workspace/${workspace.id}` : "/workspace/new")
}
