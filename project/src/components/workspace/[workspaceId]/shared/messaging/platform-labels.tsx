import { CameraIcon, MessageCircleIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"

export const platformLabels: Record<MessagingPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
}

// O que é o externalId em cada plataforma, como aparece no painel da Meta.
export const externalIdLabels: Record<MessagingPlatform, string> = {
  whatsapp: "Phone number ID",
  instagram: "ID da conta do Instagram",
}

// Classes literais para o Tailwind encontrá-las no código.
const platformColors: Record<MessagingPlatform, string> = {
  whatsapp: "text-emerald-600 dark:text-emerald-400",
  instagram: "text-fuchsia-600 dark:text-fuchsia-400",
}

// Nome do cliente; sem nome (o Instagram não manda), o número do WhatsApp ou o fim do id.
export function contactDisplayName({
  platform,
  contactName,
  contactExternalId,
}: {
  platform: MessagingPlatform
  contactName: string | null
  contactExternalId: string
}) {
  if (contactName) return contactName
  return platform === "whatsapp" ? `+${contactExternalId}` : `Instagram …${contactExternalId.slice(-5)}`
}

export function PlatformIcon({ platform, className }: { platform: MessagingPlatform; className?: string }) {
  const Icon = platform === "whatsapp" ? MessageCircleIcon : CameraIcon
  return <Icon aria-label={platformLabels[platform]} className={cn("size-4 shrink-0", platformColors[platform], className)} />
}
