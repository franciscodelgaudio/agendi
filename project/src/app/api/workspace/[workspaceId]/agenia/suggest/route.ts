import { generateText, isStepCount } from "ai"
import { z } from "zod"
import { ageniaModel, isAgeniaConfigured } from "@/lib/agenia-model"
import { smartComposePrompt } from "@/lib/agenia-prompts"
import { buildReadTools, loadConversation, loadWorkspaceContext } from "@/lib/agenia-read"
import { canUseInbox } from "@/lib/member-role"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"

export const maxDuration = 60

const NO_REPLY = "SEM_RESPOSTA"

const fail = (error: string, status: number) => Response.json({ error }, { status })

// Rascunho da próxima mensagem ao cliente, para o botão do campo de resposta. text null = a
// última mensagem do cliente não pede resposta.
export async function POST(request: Request, { params }: RouteContext<"/api/workspace/[workspaceId]/agenia/suggest">) {
  const { workspaceId } = await params
  const userId = await getSessionUserId()
  if (!userId) return fail("Sua sessão expirou. Entre novamente.", 401)
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access || !canUseInbox(access.role)) return fail("Sua função não pode usar a AgenIA aqui.", 403)
  if (!isAgeniaConfigured()) return fail("A AgenIA não está configurada: defina OPENAI_API_KEY no ambiente.", 503)

  const parsed = z.object({ conversationId: z.string() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("Requisição inválida.", 400)
  const conversation = await loadConversation(workspaceId, parsed.data.conversationId)
  if (!conversation) return fail("Conversa não encontrada.", 404)

  const ctx = await loadWorkspaceContext(workspaceId, { id: userId, role: access.role }, null)
  const { listServices, listBookings } = buildReadTools(workspaceId)
  try {
    const result = await generateText({
      model: ageniaModel(),
      instructions: smartComposePrompt(conversation, ctx),
      prompt: "Escreva a próxima mensagem.",
      tools: { listServices, listBookings },
      stopWhen: isStepCount(4),
    })
    const text = result.text.trim()
    return Response.json({ text: text && text !== NO_REPLY ? text : null })
  } catch (error) {
    console.error("AgenIA falhou ao sugerir resposta", error)
    return fail("A AgenIA falhou. Tente de novo.", 502)
  }
}
