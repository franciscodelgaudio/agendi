"use client"

import { useState } from "react"
import { BrainIcon, HistoryIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { deleteAgeniaMemoryAction, listAgeniaMemoriesAction, type AgeniaMemoryItem } from "@/lib/actions/agenia-history"
import type { AgeniaSession } from "@/components/agenia/use-agenia-session"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"

const whenFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
})

// Conversas anteriores com a AgenIA neste escopo; a atual fica marcada.
export function AgeniaHistoryMenu({ session }: { session: AgeniaSession }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void session.refreshThreads()
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Histórico de conversas" />}>
        <HistoryIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        {session.threads.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {session.threads.map((thread) => (
              <li key={thread.key} className="group flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    "grid min-w-0 flex-1 rounded-sm px-2 py-1.5 text-left hover:bg-muted",
                    thread.key === session.chat.id && "bg-muted",
                  )}
                  onClick={() => {
                    setOpen(false)
                    void session.openThread(thread.key)
                  }}
                >
                  <span className="truncate text-sm">{thread.title}</span>
                  <span className="text-xs text-muted-foreground">{whenFormat.format(new Date(thread.lastMessageAt))}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Apagar conversa"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => void session.deleteThread(thread.key)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Fatos que a AgenIA guardou sobre o workspace.
export function AgeniaMemoryMenu({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [memories, setMemories] = useState<AgeniaMemoryItem[] | null>(null)

  async function load() {
    setMemories(await listAgeniaMemoriesAction(workspaceId))
  }

  async function remove(id: string) {
    setMemories((current) => current?.filter((memory) => memory.id !== id) ?? null)
    if (!(await deleteAgeniaMemoryAction(workspaceId, id))) void load()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Memória da AgenIA" />}>
        <BrainIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        {memories === null ? (
          <div className="flex justify-center py-3">
            <Spinner className="size-4" />
          </div>
        ) : memories.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">A memória está vazia.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {memories.map((memory) => (
              <li key={memory.id} className="group flex items-start gap-1 rounded-sm px-2 py-1.5 hover:bg-muted">
                <span className="min-w-0 flex-1 text-sm">{memory.content}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Esquecer"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => void remove(memory.id)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
