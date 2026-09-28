"use client"

import { createContext, use, useState, useTransition } from "react"
import { SparklesIcon, WandSparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { AgeniaChat } from "@/components/agenia/agenia-chat"
import { useAgeniaSession } from "@/components/agenia/use-agenia-session"
import { Button } from "@/components/ui/button"

type ConversationAgenia = {
  workspaceId: string
  conversationId: string
  draft: string
  setDraft: (text: string) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const Context = createContext<ConversationAgenia | null>(null)

export const useConversationAgenia = () => use(Context)

// Conversa aberta com a AgenIA ao lado. O rascunho do campo de resposta fica aqui para a AgenIA
// poder preenchê-lo; quem envia é sempre o atendente. Monte com key da conversa.
export function ConversationAgeniaFrame({
  workspaceId,
  conversationId,
  children,
}: {
  workspaceId: string
  conversationId: string
  children: React.ReactNode
}) {
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState(false)
  const session = useAgeniaSession({
    workspaceId,
    mode: "conversation",
    id: `agenia-conversation-${conversationId}`,
    body: () => ({ conversationId }),
  })

  return (
    <Context value={{ workspaceId, conversationId, draft, setDraft, open, setOpen }}>
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {open && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-96 max-w-full flex-col border-l bg-background lg:static lg:z-auto">
            <AgeniaChat
              session={session}
              suggestions={["Escreva uma resposta para o cliente", "Resuma esta conversa", "Quais horários posso oferecer amanhã?"]}
              onUseDraft={setDraft}
              actions={
                <Button variant="ghost" size="icon-sm" aria-label="Fechar AgenIA" onClick={() => setOpen(false)}>
                  <XIcon />
                </Button>
              }
            />
          </aside>
        )}
      </div>
    </Context>
  )
}

export function ConversationAgeniaToggle() {
  const agenia = useConversationAgenia()
  if (!agenia) return null
  return (
    <Button
      variant={agenia.open ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label="AgenIA"
      onClick={() => agenia.setOpen(!agenia.open)}
    >
      <SparklesIcon />
    </Button>
  )
}

// Pede à AgenIA a próxima mensagem e coloca no campo de resposta.
export function SuggestReplyButton() {
  const agenia = useConversationAgenia()
  const [pending, startTransition] = useTransition()
  if (!agenia) return null

  function suggest() {
    startTransition(async () => {
      const response = await fetch(`/api/workspace/${agenia!.workspaceId}/agenia/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: agenia!.conversationId }),
      }).catch(() => null)
      const result = (await response?.json().catch(() => null)) as { text?: string | null; error?: string } | null
      if (!response?.ok) return void toast.error(result?.error ?? "A AgenIA falhou. Tente de novo.")
      if (!result?.text) return void toast.info("A última mensagem do cliente não pede resposta.")
      agenia!.setDraft(result.text)
    })
  }

  return (
    <Button type="button" variant="ghost" size="icon" loading={pending} aria-label="Sugerir resposta com a AgenIA" onClick={suggest}>
      <WandSparklesIcon />
    </Button>
  )
}
