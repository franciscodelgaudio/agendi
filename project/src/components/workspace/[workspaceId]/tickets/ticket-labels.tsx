import { BugIcon, CheckIcon, CircleDotIcon, LightbulbIcon, SearchIcon, type LucideIcon } from "lucide-react"
import type { TicketStatus, TicketType } from "@/service/workspace/[workspaceId]/tickets/ticket"
import { Badge } from "@/components/ui/badge"

export const ticketTypeLabels: Record<TicketType, string> = { bug: "Bug", improvement: "Melhoria" }

const typeIcons: Record<TicketType, LucideIcon> = { bug: BugIcon, improvement: LightbulbIcon }

const statusBadges: Record<TicketStatus, { label: string; icon: LucideIcon; variant: "default" | "secondary" | "outline" }> = {
  open: { label: "Aberto", icon: CircleDotIcon, variant: "outline" },
  in_review: { label: "Em análise", icon: SearchIcon, variant: "secondary" },
  resolved: { label: "Resolvido", icon: CheckIcon, variant: "default" },
}

export function TicketTypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const Icon = typeIcons[type]
  return <Icon className={className ?? "size-4 text-muted-foreground"} />
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { label, icon: Icon, variant } = statusBadges[status]
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" />
      {label}
    </Badge>
  )
}
