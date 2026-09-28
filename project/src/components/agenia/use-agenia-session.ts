"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { Chat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"
import { isAgeniaAction, type AgeniaActionName } from "@/lib/agenia-actions"
import { runAgeniaAction, type AgeniaActionResult } from "@/lib/actions/agenia"
import {
  deleteAgeniaThreadAction,
  listAgeniaThreadsAction,
  loadAgeniaThreadAction,
  type AgeniaThreadItem,
} from "@/lib/actions/agenia-history"

export type AgeniaMode = "global" | "ura" | "conversation"
export type AgeniaDataPart = { type: string; data: unknown }

type Options = {
  workspaceId: string
  mode: AgeniaMode
  // URA ou conversa com cliente; null na AgenIA global. Define o histórico mostrado.
  scopeId: string | null
  // Campos extras de cada envio (grafo da URA, conversa, página); lido na hora de enviar.
  body?: () => Record<string, unknown>
  onData?: (part: AgeniaDataPart) => void
}

// Liga o Chat do AI SDK às opções do último render e à execução das ações autorizadas.
// Cada thread do histórico é um Chat; o id do Chat é a chave da thread.
class SessionBridge {
  options: Options
  autoApprove: AgeniaActionName[] = []
  setRunning: (toolCallId: string, running: boolean) => void = () => {}
  onFinish: () => void = () => {}
  chat: Chat<UIMessage>

  constructor(options: Options) {
    this.options = options
    this.chat = this.create(crypto.randomUUID(), [])
  }

  sync(options: Options, autoApprove: AgeniaActionName[], setRunning: SessionBridge["setRunning"], onFinish: () => void) {
    this.options = options
    this.autoApprove = autoApprove
    this.setRunning = setRunning
    this.onFinish = onFinish
  }

  create(key: string, messages: UIMessage[]) {
    return new Chat<UIMessage>({
      id: key,
      messages,
      transport: new DefaultChatTransport({
        api: `/api/workspace/${this.options.workspaceId}/agenia`,
        prepareSendMessagesRequest: ({ messages: all }) => ({
          body: { messages: all, threadKey: key, mode: this.options.mode, ...this.options.body?.() },
        }),
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: ({ toolCall }) => {
        if (toolCall.dynamic || !isAgeniaAction(toolCall.toolName)) return
        if (this.autoApprove.includes(toolCall.toolName)) void this.execute(toolCall.toolCallId, toolCall.toolName, toolCall.input)
      },
      onData: (part) => this.options.onData?.(part as AgeniaDataPart),
      onFinish: () => this.onFinish(),
    })
  }

  open(key: string, messages: UIMessage[]) {
    void this.chat.stop()
    this.chat = this.create(key, messages)
    return this.chat
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
// ao autorizar, a server action roda aqui e o resultado volta para a IA continuar. Ao montar,
// retoma a conversa mais recente daquele escopo.
export function useAgeniaSession(options: Options) {
  const { workspaceId, mode, scopeId } = options
  const [bridge] = useState(() => new SessionBridge(options))
  const [chat, setChat] = useState(() => bridge.chat)
  const [autoApprove, setAutoApprove] = useState<AgeniaActionName[]>([])
  const [running, setRunning] = useState<string[]>([])
  const [threads, setThreads] = useState<AgeniaThreadItem[]>([])

  const refreshThreads = useCallback(async () => {
    const list = await listAgeniaThreadsAction(workspaceId, mode, scopeId)
    setThreads(list)
    return list
  }, [workspaceId, mode, scopeId])

  useLayoutEffect(() => {
    bridge.sync(
      options,
      autoApprove,
      (toolCallId, on) => setRunning((current) => (on ? [...current, toolCallId] : current.filter((id) => id !== toolCallId))),
      () => void refreshThreads(),
    )
  })

  const open = useCallback(
    (key: string, messages: UIMessage[]) => {
      setChat(bridge.open(key, messages))
      setAutoApprove([])
      setRunning([])
    },
    [bridge],
  )

  const openThread = useCallback(
    async (key: string) => {
      const messages = await loadAgeniaThreadAction(workspaceId, key)
      if (messages) open(key, messages as UIMessage[])
    },
    [workspaceId, open],
  )

  useEffect(() => {
    let cancelled = false
    void listAgeniaThreadsAction(workspaceId, mode, scopeId).then(async (list) => {
      if (cancelled) return
      setThreads(list)
      const latest = list[0]
      if (!latest || cancelled || bridge.chat.messages.length > 0) return
      const messages = await loadAgeniaThreadAction(workspaceId, latest.key)
      if (messages && !cancelled && bridge.chat.messages.length === 0) open(latest.key, messages as UIMessage[])
    })
    return () => {
      cancelled = true
    }
  }, [bridge, workspaceId, mode, scopeId, open])

  return {
    chat,
    running,
    autoApprove,
    threads,
    showMemory: mode !== "conversation",
    workspaceId,
    refreshThreads,
    openThread,
    newThread: () => open(crypto.randomUUID(), []),
    deleteThread: async (key: string) => {
      await deleteAgeniaThreadAction(workspaceId, key)
      if (key === chat.id) open(crypto.randomUUID(), [])
      void refreshThreads()
    },
    approve: (toolCallId: string, name: AgeniaActionName, input: unknown, always: boolean) => {
      if (always) setAutoApprove((current) => (current.includes(name) ? current : [...current, name]))
      void bridge.execute(toolCallId, name, input)
    },
    deny: (toolCallId: string, name: AgeniaActionName) => bridge.deny(toolCallId, name),
  }
}
