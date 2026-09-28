"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import {
  CheckIcon,
  CircleAlertIcon,
  SendHorizontalIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENIA_ACTIONS, isAgeniaAction, type AgeniaActionName } from "@/lib/agenia-actions"
import { AgeniaHistoryMenu, AgeniaMemoryMenu } from "@/components/agenia/agenia-history-menu"
import type { AgeniaSession } from "@/components/agenia/use-agenia-session"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

const toolLabels: Record<string, string> = {
  listServices: "Consultou os serviços",
  listProducts: "Consultou o estoque",
  listBookings: "Consultou a agenda",
  listAppointments: "Consultou os atendimentos",
  listExpenses: "Consultou as despesas",
  getCashFlow: "Consultou o caixa",
  listConversations: "Consultou as conversas",
  readConversation: "Leu a conversa",
  readUra: "Leu a URA",
  listTickets: "Consultou os tickets",
  saveMemory: "Guardou na memória",
  forgetMemory: "Esqueceu um fato da memória",
  addNode: "Criou um nó",
  updateNode: "Editou um nó",
  deleteNode: "Removeu um nó",
  addEdge: "Ligou nós",
  deleteEdge: "Removeu uma ligação",
  readNodes: "Leu nós do fluxo",
  findNodes: "Procurou nós",
  organizeLayout: "Organizou o fluxo",
  removeUnreachable: "Removeu nós soltos",
}

type ToolPart = {
  type: string
  toolCallId: string
  state: string
  input?: Record<string, unknown>
  output?: { ok?: boolean; error?: string; reason?: string }
  errorText?: string
}

const isToolPart = (part: UIMessage["parts"][number]): part is UIMessage["parts"][number] & ToolPart =>
  part.type.startsWith("tool-")

const toolName = (part: ToolPart) => part.type.slice("tool-".length)

// Ação esperando o usuário decidir: sem resultado e ainda não em execução.
function pendingApprovals(messages: UIMessage[], running: string[]) {
  const last = messages.at(-1)
  if (last?.role !== "assistant") return []
  return last.parts
    .filter(isToolPart)
    .filter(
      (part) =>
        isAgeniaAction(toolName(part)) &&
        part.state === "input-available" &&
        !running.includes(part.toolCallId),
    )
}

function readError(error: Error | undefined) {
  if (!error) return null
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? "A AgenIA falhou. Tente de novo."
  } catch {
    return error.message || "A AgenIA falhou. Tente de novo."
  }
}

type Props = {
  session: AgeniaSession
  title?: React.ReactNode
  actions?: React.ReactNode
  suggestions?: string[]
  onUseDraft?: (text: string) => void
  // Chamado antes de cada envio do usuário (ex.: o editor da URA guarda um ponto para desfazer).
  onBeforeSend?: () => void
  // A página própria mostra o histórico na lista ao lado, sem o menu no cabeçalho.
  hideHistory?: boolean
  className?: string
}

// Cada thread do histórico é um Chat próprio: trocar de thread remonta o conteúdo.
export function AgeniaChat(props: Props) {
  return <ChatView key={props.session.chat.id} {...props} />
}

function ChatView({ session, title, actions, suggestions = [], onUseDraft, onBeforeSend, hideHistory, className }: Props) {
  const { messages, sendMessage, status, stop, error, clearError } = useChat({ chat: session.chat })
  const [draft, setDraft] = useState("")
  const bottom = useRef<HTMLDivElement>(null)
  const busy = status === "submitted" || status === "streaming"
  const waiting = pendingApprovals(messages, session.running)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages, status])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy || waiting.length) return
    onBeforeSend?.()
    clearError()
    void sendMessage({ text: trimmed })
    setDraft("")
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SparklesIcon className="size-4 text-primary" />
        <span className="truncate text-sm font-medium">{title ?? "AgenIA"}</span>
        <div className="ml-auto flex items-center gap-1">
          {!hideHistory && messages.length > 0 && (
            <Button variant="ghost" size="icon-sm" aria-label="Nova conversa" onClick={session.newThread}>
              <SquarePenIcon />
            </Button>
          )}
          {!hideHistory && <AgeniaHistoryMenu session={session} />}
          {session.showMemory && <AgeniaMemoryMenu workspaceId={session.workspaceId} />}
          {actions}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <SparklesIcon className="size-6 text-primary" />
              <p className="text-sm font-medium">Como posso ajudar?</p>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {suggestions.map((suggestion) => (
                    <Button key={suggestion} variant="outline" size="xs" className="h-auto py-1 whitespace-normal" onClick={() => send(suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <Message key={message.id} message={message} session={session} onUseDraft={onUseDraft} />
            ))
          )}
          {status === "submitted" && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Pensando…
            </span>
          )}
          {error && (
            <span className="flex items-start gap-2 text-xs text-destructive">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              {readError(error)}
            </span>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={waiting.length ? "Autorize ou recuse a ação acima" : "Pergunte ou peça algo à AgenIA…"}
          aria-label="Mensagem para a AgenIA"
          disabled={waiting.length > 0}
          rows={1}
          className="max-h-40 min-h-9 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send(draft)
            }
          }}
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" aria-label="Parar" onClick={() => void stop()}>
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Enviar" disabled={!draft.trim() || waiting.length > 0}>
            <SendHorizontalIcon />
          </Button>
        )}
      </form>
    </div>
  )
}

function Message({
  message,
  session,
  onUseDraft,
}: {
  message: UIMessage
  session: AgeniaSession
  onUseDraft?: (text: string) => void
}) {
  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")
    return <p className="max-w-[85%] self-end rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text ? (
            <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
              {part.text}
            </p>
          ) : null
        }
        if (!isToolPart(part)) return null
        const name = toolName(part)
        if (name === "suggestReply") return <DraftCard key={part.toolCallId} part={part} onUse={onUseDraft} />
        if (isAgeniaAction(name)) return <ActionPart key={part.toolCallId} part={part} name={name} session={session} />
        return <ToolActivity key={part.toolCallId} part={part} name={name} />
      })}
    </div>
  )
}

function ToolActivity({ part, name }: { part: ToolPart; name: string }) {
  const done = part.state === "output-available" || part.state === "output-error"
  const failed = part.state === "output-error" || part.output?.ok === false
  return (
    <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", failed && "text-destructive")}>
      {!done ? <Spinner className="size-3" /> : failed ? <XIcon className="size-3" /> : <CheckIcon className="size-3" />}
      {toolLabels[name] ?? name}
      {name === "saveMemory" && !failed && typeof part.input?.content === "string" && <span className="truncate">: {part.input.content}</span>}
      {failed && part.output?.reason && <span className="truncate">: {part.output.reason}</span>}
    </span>
  )
}

function DraftCard({ part, onUse }: { part: ToolPart; onUse?: (text: string) => void }) {
  const text = String(part.input?.text ?? "")
  if (part.state !== "output-available" || !text) return <ToolActivity part={part} name="suggestReply" />
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <p className="text-sm whitespace-pre-wrap">{text}</p>
      {onUse && (
        <Button size="sm" variant="outline" className="self-end" onClick={() => onUse(text)}>
          Usar no campo de mensagem
        </Button>
      )}
    </div>
  )
}

function ActionPart({ part, name, session }: { part: ToolPart; name: AgeniaActionName; session: AgeniaSession }) {
  const [always, setAlways] = useState(false)
  const label = AGENIA_ACTIONS[name].label
  const summary = String(part.input?.summary ?? "")

  if (part.state === "input-streaming") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Preparando: {label}
      </span>
    )
  }

  if (part.state === "output-available" || part.state === "output-error") {
    const ok = part.state === "output-available" && part.output?.ok !== false
    return (
      <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", !ok && "border-destructive/40")}>
        {ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" /> : <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
        <div className="grid min-w-0 gap-0.5">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{ok ? summary : (part.output?.error ?? part.errorText ?? "Não foi feita.")}</span>
        </div>
      </div>
    )
  }

  const running = session.running.includes(part.toolCallId)
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
        </div>
      </div>
      <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
        <Checkbox checked={always} onCheckedChange={(checked) => setAlways(checked === true)} disabled={running} />
        Sempre autorizar &quot;{label}&quot; nesta conversa
      </Label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={running} onClick={() => session.deny(part.toolCallId, name)}>
          <XIcon />
          Recusar
        </Button>
        <Button size="sm" loading={running} onClick={() => session.approve(part.toolCallId, name, part.input, always)}>
          <CheckIcon />
          Autorizar
        </Button>
      </div>
    </div>
  )
}
