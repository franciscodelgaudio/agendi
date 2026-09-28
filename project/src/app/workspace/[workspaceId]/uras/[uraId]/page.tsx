import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { canManageMembers, type WorkspaceRole } from "@/lib/member-role"
import type { UraGraph } from "@/lib/ura-graph"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"
import { UraEditor } from "@/components/ura-editor"

type Option = { id: string; name: string }

type EditorData = {
  role: WorkspaceRole
  ura: ({ id: string; name: string; active: boolean } & UraGraph) | null
  channels: Option[]
  units: Option[]
  owner: Option[]
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
    // Quem pode receber a conversa na transferência: o proprietário e quem atende Conversas.
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "owner",
        pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: { $ifNull: ["$name", "$email"] } } }],
      },
    },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          { $match: { role: { $in: ["admin", "receptionist"] }, userId: { $ne: null } } },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: "$user" },
          { $project: { _id: 0, id: { $toString: "$user._id" }, name: { $ifNull: ["$user.name", "$user.email"] } } },
          { $sort: { name: 1 } },
        ],
      },
    },
    { $project: { _id: 0, role: 1, ura: { $first: "$ura" }, channels: 1, units: 1, owner: 1, members: 1 } },
  ])
  if (!workspace || !canManageMembers(workspace.role) || !workspace.ura) notFound()

  return (
    <UraEditor
      workspaceId={workspaceId}
      ura={workspace.ura}
      channels={workspace.channels}
      units={workspace.units}
      users={[...workspace.owner, ...workspace.members]}
    />
  )
}
