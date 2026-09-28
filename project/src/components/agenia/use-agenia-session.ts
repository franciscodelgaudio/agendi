"use client"

import { useLayoutEffect, useState } from "react"
import { Chat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"
import { isAgeniaAction, type AgeniaActionName } from "@/lib/agenia-actions"
import { runAgeniaAction, type AgeniaActionResult } from "@/lib/actions/agenia"

export type AgeniaMode = "global" | "ura" | "conversation"
export type AgeniaDataPart = { type: string; data: unknown }

type Options = {
  workspaceId: string
  mode: AgeniaMode
  id: string
  // Campos extras de cada envio (grafo da URA, conversa, página); lido na hora de enviar.
  body?: () => Record<string, unknown>
  onData?: (part: AgeniaDataPart) => void
}

// Liga o Chat do AI SDK às opções do último render e à execução das ações autorizadas.
class SessionBridge {
  options: Options
  autoApprove: AgeniaActionName[] = []
  setRunning: (toolCallId: string, running: boolean) => void = () => {}
  readonly chat: Chat<UIMessage>

  constructor(options: Options) {
    this.options = options
    this.chat = new Chat<UIMessage>({
      id: options.id,
      transport: new DefaultChatTransport({
        api: `/api/workspace/${options.workspaceId}/agenia`,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, mode: this.options.mode, ...this.options.body?.() },
        }),
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: ({ toolCall }) => {
        if (toolCall.dynamic || !isAgeniaAction(toolCall.toolName)) return
        if (this.autoApprove.includes(toolCall.toolName)) void this.execute(toolCall.toolCallId, toolCall.toolName, toolCall.input)
      },
      onData: (part) => this.options.onData?.(part as AgeniaDataPart),
    })
  }

  sync(options: Options, autoApprove: AgeniaActionName[], setRunning: SessionBridge["setRunning"]) {
    this.options = options
    this.autoApprove = autoApprove
    this.setRunning = setRunning
  }

  async execute(toolCallId: string, name: AgeniaActionName, input: unknown) {
    this.setRunning(toolCallId, true)
    let output: AgeniaActionResult
    try {
      output = await runAgeniaAction(this.options.workspaceId, name, input)
    } catch {
      output = { ok: false, error: "A ação falhou. Tente de novo." }
    }
    this.setRunning(toolCallId, false)
    void this.chat.addToolOutput({ tool: name as never, toolCallId, output: output as never })
  }

  deny(toolCallId: string, name: AgeniaActionName) {
    void this.chat.addToolOutput({
      tool: name as never,
      toolCallId,
      output: { ok: false, error: "O usuário recusou esta ação." } as never,
    })
  }
}

export type AgeniaSession = ReturnType<typeof useAgeniaSession>

// Conversa com a AgenIA. Ações que mudam dados chegam sem resultado: o card pede autorização e,
// ao autorizar, a server action roda aqui e o resultado volta para a IA continuar.
export function useAgeniaSession(options: Options) {
  const [bridge] = useState(() => new SessionBridge(options))
  const [autoApprove, setAutoApprove] = useState<AgeniaActionName[]>([])
  const [running, setRunning] = useState<string[]>([])

  useLayoutEffect(() => {
    bridge.sync(options, autoApprove, (toolCallId, on) =>
      setRunning((current) => (on ? [...current, toolCallId] : current.filter((id) => id !== toolCallId))),
    )
  })

  return {
    chat: bridge.chat,
    running,
    autoApprove,
    approve: (toolCallId: string, name: AgeniaActionName, input: unknown, always: boolean) => {
      if (always) setAutoApprove((current) => (current.includes(name) ? current : [...current, name]))
      void bridge.execute(toolCallId, name, input)
    },
    deny: (toolCallId: string, name: AgeniaActionName) => bridge.deny(toolCallId, name),
    clearAutoApprove: () => setAutoApprove([]),
  }
}
