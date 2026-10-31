"use client"

import { useTransition } from "react"
import { CircleStopIcon, EllipsisIcon, HandIcon } from "lucide-react"
import { closeConversationAction, takeConversationAction } from "@/lib/actions/messaging"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  workspaceId: string
  conversationId: string
  assignedToMe: boolean
  closed: boolean
}

export function ConversationActions({ workspaceId, conversationId, assignedToMe, closed }: Props) {
  const [pending, startTransition] = useTransition()
  const run = (action: (workspaceId: string, conversationId: string) => Promise<void>) =>
    startTransition(() => action(workspaceId, conversationId))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" loading={pending} aria-label="Ações da conversa" />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {!assignedToMe && (
          <DropdownMenuItem onClick={() => run(takeConversationAction)}>
            <HandIcon />
            Assumir conversa
          </DropdownMenuItem>
        )}
        {!closed && (
          <DropdownMenuItem variant="destructive" onClick={() => run(closeConversationAction)}>
            <CircleStopIcon />
            Encerrar conversa
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
