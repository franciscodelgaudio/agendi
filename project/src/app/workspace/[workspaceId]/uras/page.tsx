import Link from "@/components/link"
import { notFound } from "next/navigation"
import { ActivityIcon, CircleAlertIcon, CircleDotIcon, SettingsIcon, TagIcon, WorkflowIcon, ZapIcon } from "lucide-react"
import { canManageMembers, type WorkspaceRole } from "@/lib/member-role"
import type { StartData, UraTrigger } from "@/lib/ura-nodes"
import { isUraQueueConfigured } from "@/lib/ura-queue"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"
import { CreateUraSheet } from "@/components/create-ura-sheet"
import { UraActions } from "@/components/ura-actions"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type UraRow = { id: string; name: string; active: boolean; start: StartData | null; running: number }

const triggerLabels: Record<UraTrigger, string> = {
  new_conversation: "Conversa nova",
  keyword: "Palavra-chave",
  any_message: "Qualquer mensagem",
}

export default async function UrasPage({ params }: PageProps<"/workspace/[workspaceId]/uras">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ role: WorkspaceRole; uras: UraRow[] }>([
    ...access,
    {
      $lookup: {
        from: "uras",
        localField: "_id",
        foreignField: "workspaceId",
        as: "uras",
        pipeline: [
          { $sort: { createdAt: 1 } },
          {
            $lookup: {
              from: "ura_sessions",
              localField: "_id",
              foreignField: "uraId",
              as: "sessions",
              pipeline: [{ $match: { status: { $in: ["running", "waiting", "sleeping"] } } }, { $project: { _id: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              active: 1,
              start: {
                $ifNull: [{ $first: { $filter: { input: "$nodes", cond: { $eq: ["$$this.type", "start"] } } } }, null],
              },
              running: { $size: "$sessions" },
            },
          },
          { $set: { start: "$start.data" } },
        ],
      },
    },
    { $project: { _id: 0, role: 1, uras: 1 } },
  ])
  if (!workspace || !canManageMembers(workspace.role)) notFound()

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">URAs</h2>
        {workspace.uras.length > 0 && <CreateUraSheet workspaceId={workspaceId} />}
      </div>

      {!isUraQueueConfigured() && (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            As URAs não rodam sem fila. Defina no ambiente: <code className="font-mono">REDIS_URL</code>
          </span>
        </div>
      )}

      {workspace.uras.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma URA criada</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <CreateUraSheet workspaceId={workspaceId} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border">
          <Table>
            <TableHeader>
              <TableRow>
                <HeadWithIcon icon={TagIcon} label="Nome" className="w-full" />
                <HeadWithIcon icon={ZapIcon} label="Gatilho" className="@max-lg:hidden" />
                <HeadWithIcon icon={ActivityIcon} label="Em andamento" className="@max-2xl:hidden" />
                <HeadWithIcon icon={CircleDotIcon} label="Status" />
                <HeadWithIcon icon={SettingsIcon} label="Ações" className="w-0 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.uras.map((ura) => (
                <TableRow key={ura.id}>
                  <TableCell className="max-w-0 truncate px-4 font-medium">
                    <Link href={`/workspace/${workspaceId}/uras/${ura.id}`} className="hover:underline">
                      {ura.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground @max-lg:hidden">
                    {ura.start ? triggerLabels[ura.start.trigger] : "—"}
                  </TableCell>
                  <TableCell className="px-4 tabular-nums @max-2xl:hidden">{ura.running}</TableCell>
                  <TableCell className="px-4">
                    <Badge variant={ura.active ? "default" : "secondary"}>{ura.active ? "Ativa" : "Inativa"}</Badge>
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <UraActions workspaceId={workspaceId} ura={ura} />
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
