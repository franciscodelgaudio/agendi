"use client"

import { useEffect } from "react"
import Link from "@/components/shared/link"
import { useParams, useRouter } from "next/navigation"
import { InboxIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"
import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"
import { contactDisplayName, PlatformIcon } from "@/components/workspace/[workspaceId]/shared/messaging/platform-labels"
import { Avatar } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"

// Intervalo em que a caixa busca mensagens novas (o webhook grava no banco; a tela relê).
const REFRESH_MS = 5000

export type ConversationListItem = {
  id: string
  platform: MessagingPlatform
  contactName: string | null
  contactExternalId: string
  channelName: string
  lastMessageAt: Date | null
  lastMessagePreview: string | null
  unreadCount: number
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

// Hoje mostra a hora; outros dias, a data.
function shortWhen(date: Date) {
  return dayFormat.format(date) === dayFormat.format(new Date()) ? timeFormat.format(date) : dayFormat.format(date)
}

type Props = { workspaceId: string; conversations: ConversationListItem[]; children: React.ReactNode }

// Lista à esquerda e conversa aberta à direita. No celular aparece um dos dois por vez.
export function InboxShell({ workspaceId, conversations, children }: Props) {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  return (
    <div className="flex h-svh min-h-0">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0",
          conversationId && "hidden md:flex",
        )}
      >
        <div className="flex h-12 shrink-0 items-center border-b px-4">
          <h2 className="font-semibold">Conversas</h2>
        </div>
        {conversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <InboxIcon className="size-6" />
            Nenhuma conversa ainda.
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((conversation) => {
              const name = contactDisplayName(conversation)
              const active = conversation.id === conversationId
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/workspace/${workspaceId}/inbox/${conversation.id}`}
                    className={cn(
                      "flex items-center gap-3 border-b px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted",
                      active && "bg-muted",
                    )}
                  >
                    <Avatar className="size-10">
                      <InitialFallback name={name} />
                    </Avatar>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon platform={conversation.platform} className="size-3.5" />
                        <span className={cn("truncate text-sm", conversation.unreadCount > 0 && "font-semibold")}>
                          {name}
                        </span>
                        {conversation.lastMessageAt && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {shortWhen(conversation.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {conversation.lastMessagePreview ?? conversation.channelName}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", conversationId ? "flex" : "hidden md:flex")}>{children}</section>
    </div>
  )
}
