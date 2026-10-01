import { notFound } from "next/navigation"
import { CalendarIcon, CircleDotIcon, LifeBuoyIcon, TagIcon, TextIcon } from "lucide-react"
import { Types } from "mongoose"
import type { TicketStatus, TicketType } from "@/service/workspace/[workspaceId]/tickets/ticket"
import { requireUser } from "@/service/(auth)/session"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { Ticket } from "@/models/Ticket"
import { CreateTicketSheet } from "@/components/workspace/[workspaceId]/tickets/create-ticket-sheet"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { TicketStatusBadge, ticketTypeLabels, TicketTypeIcon } from "@/components/workspace/[workspaceId]/tickets/ticket-labels"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
})

type TicketRow = { id: string; type: TicketType; title: string; status: TicketStatus; createdAt: Date }

// Cada usuário vê só os tickets que ele abriu neste workspace.
export default async function TicketsPage({ params }: PageProps<"/workspace/[workspaceId]/tickets">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = await findWorkspaceAccess(workspaceId, user.id)
  if (!access) notFound()

  const tickets = await Ticket.aggregate<TicketRow>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(user.id) } },
    { $sort: { createdAt: -1 } },
    { $project: { _id: 0, id: { $toString: "$_id" }, type: 1, title: 1, status: 1, createdAt: 1 } },
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Tickets</h2>
        {tickets.length > 0 && <CreateTicketSheet workspaceId={workspaceId} />}
      </div>

      {tickets.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LifeBuoyIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum ticket</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <CreateTicketSheet workspaceId={workspaceId} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border">
          <Table>
            <TableHeader>
              <TableRow>
                <CodeHead className="@max-2xl:hidden" />
                <HeadWithIcon icon={TagIcon} label="Tipo" />
                <HeadWithIcon icon={TextIcon} label="Título" className="w-full" />
                <HeadWithIcon icon={CircleDotIcon} label="Status" />
                <HeadWithIcon icon={CalendarIcon} label="Aberto em" className="@max-xl:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <CodeCell id={ticket.id} className="@max-2xl:hidden" />
                  <TableCell className="px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <TicketTypeIcon type={ticket.type} />
                      {ticketTypeLabels[ticket.type]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0 truncate px-4 font-medium">{ticket.title}</TableCell>
                  <TableCell className="px-4">
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground @max-xl:hidden">
                    {dateFormat.format(ticket.createdAt)}
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
