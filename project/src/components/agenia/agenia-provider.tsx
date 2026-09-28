"use client"

import { createContext, use, useState } from "react"
import { usePathname } from "next/navigation"
import { Maximize2Icon, XIcon } from "lucide-react"
import Link from "@/components/link"
import { AgeniaChat } from "@/components/agenia/agenia-chat"
import { useAgeniaSession, type AgeniaSession } from "@/components/agenia/use-agenia-session"
import { Button } from "@/components/ui/button"

type AgeniaContext = { session: AgeniaSession; open: boolean; setOpen: (open: boolean) => void; pageHref: string }

const Context = createContext<AgeniaContext | null>(null)

// null quando a função do usuário não usa a AgenIA global.
export const useAgenia = () => use(Context)

export const GLOBAL_SUGGESTIONS = [
  "Como está o caixa deste mês?",
  "Quais agendamentos temos hoje?",
  "Quais produtos estão acabando?",
  "Resuma as conversas sem resposta",
]

// Conversa global da AgenIA, a mesma no painel lateral e na página própria: continua ao navegar.
export function AgeniaProvider({ workspaceId, enabled, children }: { workspaceId: string; enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const session = useAgeniaSession({ workspaceId, mode: "global", scopeId: null, body: () => ({ page: pathname }) })
  const pageHref = `/workspace/${workspaceId}/agenia`

  if (!enabled) return children

  return (
    <Context value={{ session, open, setOpen, pageHref }}>
      {children}
      {open && pathname !== pageHref && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-lg sm:w-96">
          <AgeniaChat
            session={session}
            suggestions={GLOBAL_SUGGESTIONS}
            actions={
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Abrir em tela cheia"
                  nativeButton={false}
                  render={<Link href={pageHref} />}
                  onClick={() => setOpen(false)}
                >
                  <Maximize2Icon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Fechar AgenIA" onClick={() => setOpen(false)}>
                  <XIcon />
                </Button>
              </>
            }
          />
        </aside>
      )}
    </Context>
  )
}
