"use client"

import { createContext, use, useState } from "react"
import { usePathname } from "next/navigation"
import { Popover } from "@base-ui/react/popover"
import { Maximize2Icon, SparklesIcon, XIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { AgeniaChat } from "@/components/workspace/[workspaceId]/agenia/agenia-chat"
import { useAgeniaSession, type AgeniaSession } from "@/components/workspace/[workspaceId]/agenia/use-agenia-session"
import { LandingLogo } from "@/components/shared/landing/landing-logo"
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

// Conversa global da AgenIA, a mesma no balão e na página própria: continua ao navegar.
// O botão flutuante abre a conversa num balão acima dele, com a página atual como contexto; some na
// página da AgenIA e nas conversas do inbox, que têm a AgenIA própria e o campo de resposta embaixo.
export function AgeniaProvider({ workspaceId, enabled, children }: { workspaceId: string; enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const session = useAgeniaSession({ workspaceId, mode: "global", scopeId: null, body: () => ({ page: pathname }) })
  const pageHref = `/workspace/${workspaceId}/agenia`

  if (!enabled) return children

  const floating = pathname !== pageHref && !pathname.startsWith(`/workspace/${workspaceId}/inbox/`)

  return (
    <Context value={{ session, open, setOpen, pageHref }}>
      {children}
      {floating && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            data-tour="agenia-button"
            render={
              <Button
                className="fixed right-5 bottom-5 z-30 size-14 rounded-full shadow-lg motion-safe:animate-agenia-breathe"
                aria-label={open ? "Fechar AgenIA" : "Abrir AgenIA"}
              />
            }
          >
            <LandingLogo className="size-7" />
            <SparklesIcon className="absolute top-2.5 right-2.5 size-3.5 fill-current motion-safe:animate-agenia-twinkle" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="top" align="end" sideOffset={14} collisionPadding={16} className="isolate z-50">
              <Popover.Popup className="flex h-[min(38rem,calc(100svh-7rem))] w-[min(26rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col rounded-2xl bg-background shadow-xl ring-1 ring-foreground/10 outline-hidden transition duration-200 data-ending-style:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:scale-95 data-starting-style:opacity-0">
                <Popover.Title className="sr-only">AgenIA</Popover.Title>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
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
                        <Popover.Close render={<Button variant="ghost" size="icon-sm" aria-label="Fechar AgenIA" />}>
                          <XIcon />
                        </Popover.Close>
                      </>
                    }
                  />
                </div>
                {/* Ponta do balão, apontando para o botão. */}
                <Popover.Arrow className="data-[side=top]:-bottom-1.5">
                  <span className="block size-3 rotate-45 bg-background shadow-[1px_1px_0_0_var(--color-border)]" />
                </Popover.Arrow>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </Context>
  )
}
