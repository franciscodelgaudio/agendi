"use client"

import { AgeniaChat } from "@/components/agenia/agenia-chat"
import { GLOBAL_SUGGESTIONS, useAgenia } from "@/components/agenia/agenia-provider"

// Mesma conversa do painel lateral, em tela cheia.
export function AgeniaFullPage() {
  const agenia = useAgenia()
  if (!agenia) return null
  return (
    <div className="flex h-svh min-h-0 flex-col">
      <AgeniaChat session={agenia.session} suggestions={GLOBAL_SUGGESTIONS} className="mx-auto w-full max-w-3xl" />
    </div>
  )
}
