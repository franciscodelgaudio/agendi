"use client"

import { useState } from "react"
import { HistoryIcon, SquarePenIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/service/_shared/utils"
import { AgeniaChat } from "@/components/workspace/[workspaceId]/agenia/agenia-chat"
import { GLOBAL_SUGGESTIONS, useAgenia } from "@/components/workspace/[workspaceId]/agenia/agenia-provider"
import { Button } from "@/components/ui/button"

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

// Hoje mostra a hora; outros dias, a data (como na lista de conversas).
function shortWhen(date: Date) {
  return dayFormat.format(date) === dayFormat.format(new Date()) ? timeFormat.format(date) : dayFormat.format(date)
}

// Histórico à esquerda e a conversa à direita, a mesma do painel lateral. No celular aparece
// um dos dois por vez.
export function AgeniaFullPage() {
  const agenia = useAgenia()
  const [showList, setShowList] = useState(false)
  if (!agenia) return null
  const { session } = agenia

  return (
    <div className="flex h-svh min-h-0">
      <aside className={cn("w-full min-w-0 flex-col border-r md:flex md:w-80 md:shrink-0", showList ? "flex" : "hidden")}>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <h2 className="font-semibold">AgenIA</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Nova conversa"
            onClick={() => {
              session.newThread()
              setShowList(false)
            }}
          >
            <SquarePenIcon />
          </Button>
        </div>
        {session.threads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <HistoryIcon className="size-6" />
            Nenhuma conversa ainda.
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {session.threads.map((thread) => {
              const active = thread.key === session.chat.id
              return (
                <li key={thread.key} className={cn("group flex items-center border-b hover:bg-muted/50", active && "bg-muted")}>
                  <button
                    type="button"
                    className="grid min-w-0 flex-1 gap-0.5 px-4 py-3 text-left outline-none focus-visible:bg-muted"
                    onClick={() => {
                      void session.openThread(thread.key)
                      setShowList(false)
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", active && "font-medium")}>{thread.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{shortWhen(new Date(thread.lastMessageAt))}</span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Apagar conversa"
                    className="mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void session.deleteThread(thread.key)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section data-tour="agenia-chat" className={cn("min-w-0 flex-1 flex-col md:flex", showList ? "hidden" : "flex")}>
        <AgeniaChat
          session={session}
          suggestions={GLOBAL_SUGGESTIONS}
          hideHistory
          actions={
            <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Histórico de conversas" onClick={() => setShowList(true)}>
              <HistoryIcon />
            </Button>
          }
        />
      </section>
    </div>
  )
}
