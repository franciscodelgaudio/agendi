import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { AGENIA_ACTION_NAMES, AGENIA_ACTIONS, type AgeniaActionName } from "@/lib/agenia-actions"
import { loadAgeniaModel, NOT_CONFIGURED_MESSAGE } from "@/lib/agenia-model"
import { conversationPrompt, globalPrompt, uraPrompt } from "@/lib/agenia-prompts"
import { buildMemoryTools, buildReadTools, loadConversation, loadWorkspaceContext } from "@/lib/agenia-read"
import { isThreadTaken, persistThread } from "@/lib/agenia-store"
import { recordAiUsage } from "@/lib/ai-usage-store"
import { uraGraphIndex } from "@/lib/agenia-ura"
import { buildUraTools } from "@/lib/agenia-ura-tools"
import { canManageMembers, canUseInbox } from "@/lib/member-role"
import { isReplyWindowOpen } from "@/lib/messaging-send"
import { getSessionUserId } from "@/lib/session"
import { parseUraGraph } from "@/lib/ura-graph"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { availableVariables } from "@/components/ura-node-meta"

export const maxDuration = 120

const MAX_STEPS = 24

// Quem só atende conversas (recepção) usa a AgenIA dentro da conversa, sem mexer no resto do sistema.
const INBOX_ACTIONS: AgeniaActionName[] = ["sendReply", "takeConversation", "closeConversation", "stopConversationUra"]

const bodySchema = z.object({
  messages: z.array(z.any()),
  // Id da conversa com a AgenIA (uuid gerado no navegador); com ele o histórico é gravado.
  threadKey: z.string().max(64),
  mode: z.enum(["global", "ura", "conversation"]),
  page: z.string().max(300).nullable().optional(),
  ura: z
    .object({
      id: z.string(),
      name: z.string(),
      active: z.boolean(),
      graph: z.unknown(),
      selectedNodeId: z.string().nullable(),
    })
    .optional(),
  conversationId: z.string().optional(),
})

// Ações sem execute: o cliente mostra o card de autorização e roda a server action.
function actionTools(names: AgeniaActionName[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => {
      const inputSchema: z.ZodType<Record<string, unknown>> = AGENIA_ACTIONS[name].input
      return [name, tool({ description: AGENIA_ACTIONS[name].description, inputSchema })]
    }),
  )
}

const suggestReply = tool({
  description:
    "Coloca um rascunho de mensagem no campo de digitação do atendente. Ele lê, edita e decide enviar; nada é enviado ao cliente.",
  inputSchema: z.object({ text: z.string().min(1).max(4096).describe("A mensagem pronta, no tom que o cliente vai ler.") }),
  execute: async ({ text }) => ({ ok: true, chars: text.length }),
})

const fail = (error: string, status: number) => Response.json({ error }, { status })

export async function POST(request: Request, { params }: RouteContext<"/api/workspace/[workspaceId]/agenia">) {
  const { workspaceId } = await params
  const userId = await getSessionUserId()
  if (!userId) return fail("Sua sessão expirou. Entre novamente.", 401)
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access) return fail("Workspace não encontrado.", 404)
  const agenia = await loadAgeniaModel(workspaceId)
  if (!agenia) return fail(NOT_CONFIGURED_MESSAGE, 503)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("Requisição inválida.", 400)
  const body = parsed.data
  const manager = canManageMembers(access.role)
  if (body.mode === "conversation" ? !canUseInbox(access.role) : !manager) {
    return fail("Sua função não pode usar a AgenIA aqui.", 403)
  }

  const ctx = await loadWorkspaceContext(workspaceId, { id: userId, role: access.role }, body.page ?? null)
  const reads = buildReadTools(workspaceId)
  const tools: ToolSet = manager
    ? { ...reads, ...actionTools(AGENIA_ACTION_NAMES) }
    : { listServices: reads.listServices, listBookings: reads.listBookings, ...actionTools(INBOX_ACTIONS) }
  const owner = { workspaceId, userId }
  if (manager) Object.assign(tools, buildMemoryTools(owner))
  if (await isThreadTaken(body.threadKey, owner)) return fail("Conversa da AgenIA não encontrada.", 404)
  const scopeId = body.mode === "ura" ? (body.ura?.id ?? null) : body.mode === "conversation" ? (body.conversationId ?? null) : null

  let instructions = globalPrompt(ctx)
  let uraGraph = null
  if (body.mode === "ura") {
    const graph = body.ura && parseUraGraph(body.ura.graph)
    if (!graph || !graph.ok) return fail("O fluxo tem dados inválidos. Recarregue a página.", 400)
    uraGraph = graph.graph
    instructions = uraPrompt(ctx, {
      name: body.ura!.name,
      active: body.ura!.active,
      selectedNodeId: body.ura!.selectedNodeId,
      index: uraGraphIndex(uraGraph),
      variables: availableVariables(uraGraph.nodes),
    })
  }
  if (body.mode === "conversation") {
    const conversation = body.conversationId ? await loadConversation(workspaceId, body.conversationId) : null
    if (!conversation) return fail("Conversa não encontrada.", 404)
    instructions = conversationPrompt(ctx, { ...conversation, windowOpen: isReplyWindowOpen(conversation.lastInboundAt, new Date()) })
    tools.suggestReply = suggestReply
  }

  const messages = await convertToModelMessages(body.messages as UIMessage[])

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const allTools = uraGraph
        ? { ...tools, ...buildUraTools(uraGraph, (graph) => writer.write({ type: "data-ura-graph", data: graph, transient: true })) }
        : tools
      const result = streamText({
        model: agenia.model,
        instructions,
        messages,
        tools: allTools,
        stopWhen: isStepCount(MAX_STEPS),
        onEnd: (event) =>
          recordAiUsage(owner, `agenia_${body.mode}`, event.response.modelId || agenia.name, event.totalUsage),
      })
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          originalMessages: body.messages as UIMessage[],
          generateMessageId: () => crypto.randomUUID(),
          onEnd: async ({ messages: all }) => {
            const saved = await persistThread({ key: body.threadKey, mode: body.mode, scopeId, messages: all }, owner)
            if (!saved.ok) console.error("AgenIA: histórico não gravado", saved.error)
          },
        }),
      )
    },
    onError: (error) => {
      console.error("AgenIA falhou", error)
      return "A AgenIA falhou. Tente de novo."
    },
  })

  return createUIMessageStreamResponse({ stream })
}
