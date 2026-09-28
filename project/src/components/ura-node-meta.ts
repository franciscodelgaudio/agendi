import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleStopIcon,
  ClockIcon,
  CornerDownRightIcon,
  GitBranchIcon,
  HeadsetIcon,
  ImageIcon,
  ListIcon,
  MessageCircleQuestionIcon,
  MessageSquareTextIcon,
  PlayIcon,
  SparklesIcon,
  VariableIcon,
  type LucideIcon,
} from "lucide-react"
import type { GraphIssueCode, UraNode } from "@/lib/ura-graph"
import type { ConditionOperator, UraNodeType } from "@/lib/ura-nodes"
import { BUILTIN_VARIABLES } from "@/lib/ura-variables"

export type NodeCategory = "start" | "messages" | "questions" | "logic" | "booking" | "end"

export const nodeMeta: Record<UraNodeType, { label: string; icon: LucideIcon; category: NodeCategory }> = {
  start: { label: "Início", icon: PlayIcon, category: "start" },
  sendMessage: { label: "Enviar mensagem", icon: MessageSquareTextIcon, category: "messages" },
  sendMedia: { label: "Enviar mídia", icon: ImageIcon, category: "messages" },
  waitForReply: { label: "Aguardar resposta", icon: MessageCircleQuestionIcon, category: "questions" },
  menu: { label: "Menu", icon: ListIcon, category: "questions" },
  condition: { label: "Condição", icon: GitBranchIcon, category: "logic" },
  setVariable: { label: "Definir variável", icon: VariableIcon, category: "logic" },
  goTo: { label: "Ir para", icon: CornerDownRightIcon, category: "logic" },
  delay: { label: "Pausa", icon: ClockIcon, category: "logic" },
  chooseService: { label: "Escolher serviço", icon: SparklesIcon, category: "booking" },
  chooseSlot: { label: "Escolher horário", icon: CalendarClockIcon, category: "booking" },
  createBooking: { label: "Criar agendamento", icon: CalendarCheckIcon, category: "booking" },
  handoff: { label: "Transferir para equipe", icon: HeadsetIcon, category: "end" },
  closeConversation: { label: "Encerrar conversa", icon: CircleStopIcon, category: "end" },
}

export const categoryMeta: Record<NodeCategory, { label: string; className: string }> = {
  start: { label: "Início", className: "bg-emerald-600 text-white" },
  messages: { label: "Mensagens", className: "bg-sky-600 text-white" },
  questions: { label: "Perguntas", className: "bg-violet-600 text-white" },
  logic: { label: "Lógica", className: "bg-amber-600 text-white" },
  booking: { label: "Agendamento", className: "bg-pink-600 text-white" },
  end: { label: "Fim", className: "bg-zinc-700 text-white" },
}

export const PALETTE: NodeCategory[] = ["messages", "questions", "logic", "booking", "end"]

const fixedHandleLabels: Record<string, string> = {
  invalid: "Inválida",
  timeout: "Sem resposta",
  empty: "Sem opções",
  error: "Erro",
  true: "Sim",
  false: "Não",
}

// Rótulo de cada saída no nó. Nó com uma saída só não mostra rótulo.
export function handleLabel(node: UraNode, handle: string) {
  if (handle.startsWith("option_") && node.type === "menu") {
    return node.data.options[Number(handle.slice("option_".length))]?.label ?? handle
  }
  if (handle === "default") {
    if (node.type === "waitForReply") return "Respondeu"
    if (node.type === "chooseService" || node.type === "chooseSlot") return "Escolheu"
    if (node.type === "createBooking") return "Agendado"
    return ""
  }
  return fixedHandleLabels[handle] ?? handle
}

export const operatorLabels: Record<ConditionOperator, string> = {
  equals: "é igual a",
  not_equals: "é diferente de",
  contains: "contém",
  not_contains: "não contém",
  exists: "está preenchida",
  not_exists: "está vazia",
  greater: "é maior que",
  less: "é menor que",
}

export const issueLabels: Record<GraphIssueCode, string> = {
  start_not_connected: "O início não está ligado a nenhum nó.",
  empty_text: "Mensagem vazia.",
  menu_without_options: "Menu sem opções.",
  missing_media_url: "Mídia sem arquivo ou link.",
  missing_unit: "Escolha a unidade.",
  missing_target: "Escolha o nó de destino.",
  unreachable: "Nenhum caminho chega a este nó.",
}

const BOOKING_VARIABLES: Partial<Record<UraNodeType, string[]>> = {
  chooseService: ["unidade_id", "servico_id", "servico_nome", "servico_preco", "servico_duracao"],
  chooseSlot: ["horario_inicio", "horario_texto", "terapeuta_id", "terapeuta_nome", "sala_id"],
  createBooking: ["agendamento_id"],
}

// Variáveis que dá para usar em {{...}}: as embutidas e as que os nós do fluxo criam.
export function availableVariables(nodes: UraNode[]) {
  const names = new Set<string>([...BUILTIN_VARIABLES, "ultima_resposta"])
  for (const node of nodes) {
    if ((node.type === "waitForReply" || node.type === "menu" || node.type === "setVariable") && node.data.variable) {
      names.add(node.data.variable)
    }
    for (const name of BOOKING_VARIABLES[node.type] ?? []) names.add(name)
  }
  return [...names]
}

const truncate = (value: string, max = 60) => (value.length > max ? `${value.slice(0, max)}…` : value)

// Linha de resumo mostrada no corpo do nó.
export function nodeSummary(node: UraNode, nodeTitle: (id: string) => string | null): string | null {
  switch (node.type) {
    case "start": {
      const { trigger, keywords } = node.data
      if (trigger === "keyword") return keywords.length ? `Palavras: ${truncate(keywords.join(", "))}` : "Palavra-chave"
      return trigger === "new_conversation" ? "Conversa nova" : "Qualquer mensagem"
    }
    case "sendMessage":
      return node.data.text ? truncate(node.data.text) : null
    case "sendMedia":
      return node.data.url ? truncate(node.data.caption || node.data.url) : null
    case "waitForReply":
    case "closeConversation":
    case "handoff":
      return node.data.message ? truncate(node.data.message) : null
    case "menu":
    case "chooseService":
    case "chooseSlot":
      return node.data.message ? truncate(node.data.message) : null
    case "condition":
      return node.data.variable
        ? `${node.data.variable} ${operatorLabels[node.data.operator]}${
            node.data.operator === "exists" || node.data.operator === "not_exists" ? "" : ` ${truncate(node.data.value, 24)}`
          }`
        : null
    case "setVariable":
      return node.data.variable ? `${node.data.variable} = ${truncate(node.data.value, 30)}` : null
    case "goTo":
      return nodeTitle(node.data.targetNodeId)
    case "delay": {
      const { seconds } = node.data
      if (seconds % 3600 === 0) return `${seconds / 3600} h`
      if (seconds % 60 === 0) return `${seconds / 60} min`
      return `${seconds} s`
    }
    case "createBooking":
      return null
  }
}
