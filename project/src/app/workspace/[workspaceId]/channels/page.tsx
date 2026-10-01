import { notFound } from "next/navigation"
import { CircleAlertIcon, HashIcon, LinkIcon, RadioTowerIcon, SettingsIcon, TagIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { missingMessagingEnv, webhookUrl } from "@/service/workspace/[workspaceId]/channels/messaging-config"
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { ChannelActions } from "@/components/workspace/[workspaceId]/channels/channel-actions"
import { CreateChannelSheet } from "@/components/workspace/[workspaceId]/channels/create-channel-sheet"
import { PlatformIcon, platformLabels } from "@/components/workspace/[workspaceId]/shared/messaging/platform-labels"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Channel = { id: string; name: string; platform: MessagingPlatform; externalId: string }

export default async function ChannelsPage({ params }: PageProps<"/workspace/[workspaceId]/channels">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; channels: Channel[] }>([
    ...access,
    {
      $lookup: {
        from: "messaging_channels",
        localField: "_id",
        foreignField: "workspaceId",
        as: "channels",
        pipeline: [
          { $sort: { createdAt: 1 } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, platform: 1, externalId: 1 } },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, channels: 1 } },
  ])
  // Canais guardam tokens de acesso: só quem gerencia o workspace vê a página.
  if (!workspace || !can(workspace.actor, "channels.manage")) notFound()

  const missingEnv = missingMessagingEnv()
  const callbackUrl = webhookUrl()

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Canais</h2>
        {workspace.channels.length > 0 && <CreateChannelSheet workspaceId={workspaceId} />}
      </div>

      {missingEnv.length > 0 && (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Integração incompleta. Defina no ambiente: <code className="font-mono">{missingEnv.join(", ")}</code>
          </span>
        </div>
      )}

      {callbackUrl && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LinkIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Webhook:</span>
          <code className="font-mono select-all">{callbackUrl}</code>
        </div>
      )}

      {workspace.channels.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RadioTowerIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum canal conectado</EmptyTitle>
            <EmptyDescription>Conecte um número do WhatsApp Business ou uma conta do Instagram.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateChannelSheet workspaceId={workspaceId} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border">
          <Table>
            <TableHeader>
              <TableRow>
                <CodeHead className="@max-2xl:hidden" />
                <HeadWithIcon icon={TagIcon} label="Nome" className="w-full" />
                <HeadWithIcon icon={RadioTowerIcon} label="Plataforma" />
                <HeadWithIcon icon={HashIcon} label="ID na Meta" className="@max-xl:hidden" />
                <HeadWithIcon icon={SettingsIcon} label="Ações" className="w-0 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.channels.map((channel) => (
                <TableRow key={channel.id}>
                  <CodeCell id={channel.id} className="@max-2xl:hidden" />
                  <TableCell className="max-w-0 truncate px-4 font-medium">{channel.name}</TableCell>
                  <TableCell className="px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={channel.platform} />
                      {platformLabels[channel.platform]}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 font-mono text-xs text-muted-foreground @max-xl:hidden">
                    {channel.externalId}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <ChannelActions workspaceId={workspaceId} channel={channel} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function HeadWithIcon({
  icon: Icon,
  label,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  className?: string
}) {
  return (
    <TableHead className={`px-4 ${className ?? ""}`}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}
