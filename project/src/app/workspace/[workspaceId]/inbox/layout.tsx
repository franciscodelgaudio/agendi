import { Suspense } from "react"
import { notFound } from "next/navigation"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { InboxShell, type ConversationListItem } from "@/components/workspace/[workspaceId]/inbox/inbox-shell"
import { InboxSkeleton } from "@/components/shared/page-skeletons"

// Conversas mais recentes primeiro; as mais antigas ficam de fora da lista.
const CONVERSATION_LIMIT = 100

// A lista de conversas carrega sob o skeleton da inbox. A conversa fica dentro do mesmo limite:
// a página vazia (sem conversa aberta) depende da verificação de acesso feita aqui.
export default async function InboxLayout({ children, params }: LayoutProps<"/workspace/[workspaceId]/inbox">) {
  const { workspaceId } = await params
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <Inbox workspaceId={workspaceId}>{children}</Inbox>
    </Suspense>
  )
}

async function Inbox({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; conversations: ConversationListItem[] }>([
    ...access,
    {
      $lookup: {
        from: "conversations",
        localField: "_id",
        foreignField: "workspaceId",
        as: "conversations",
        pipeline: [
          { $sort: { lastMessageAt: -1 } },
          { $limit: CONVERSATION_LIMIT },
          {
            $lookup: {
              from: "messaging_channels",
              localField: "channelId",
              foreignField: "_id",
              as: "channel",
              pipeline: [{ $project: { _id: 0, name: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              platform: 1,
              contactName: 1,
              contactExternalId: 1,
              channelName: { $ifNull: [{ $first: "$channel.name" }, ""] },
              lastMessageAt: 1,
              lastMessagePreview: 1,
              unreadCount: 1,
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, conversations: 1 } },
  ])
  if (!workspace || !can(workspace.actor, "inbox.use")) notFound()

  return (
    <InboxShell workspaceId={workspaceId} conversations={workspace.conversations}>
      {children}
    </InboxShell>
  )
}
