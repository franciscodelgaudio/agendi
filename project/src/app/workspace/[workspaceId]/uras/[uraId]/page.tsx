import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import type { UraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { UraEditor } from "@/components/workspace/[workspaceId]/uras/[uraId]/ura-editor"

type Option = { id: string; name: string }

type EditorData = {
  actor: Actor
  ura: ({ id: string; name: string; active: boolean } & UraGraph) | null
  channels: Option[]
  units: Option[]
  members: Option[]
}

export default async function UraEditorPage({ params }: PageProps<"/workspace/[workspaceId]/uras/[uraId]">) {
  const { workspaceId, uraId } = await params
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(uraId)) notFound()

  const [workspace] = await Workspace.aggregate<EditorData>([
    ...access,
    {
      $lookup: {
        from: "uras",
        localField: "_id",
        foreignField: "workspaceId",
        as: "ura",
        pipeline: [
          { $match: { _id: new Types.ObjectId(uraId) } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, active: 1, nodes: 1, edges: 1 } },
        ],
      },
    },
    {
      $lookup: {
        from: "messaging_channels",
        localField: "_id",
        foreignField: "workspaceId",
        as: "channels",
        pipeline: [{ $sort: { createdAt: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [{ $sort: { name: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    // Quem pode receber a conversa na transferência: administradores e quem usa as Conversas.
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          { $match: { userId: { $ne: null } } },
          { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
          { $match: { $or: [{ admin: true }, { "role.permissions": "inbox.use" }] } },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: "$user" },
          { $project: { _id: 0, id: { $toString: "$user._id" }, name: { $ifNull: ["$user.name", "$user.email"] } } },
          { $sort: { name: 1 } },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, ura: { $first: "$ura" }, channels: 1, units: 1, members: 1 } },
  ])
  if (!workspace || !can(workspace.actor, "uras.manage") || !workspace.ura) notFound()

  return (
    <UraEditor
      workspaceId={workspaceId}
      ura={workspace.ura}
      channels={workspace.channels}
      units={workspace.units}
      users={workspace.members}
    />
  )
}
