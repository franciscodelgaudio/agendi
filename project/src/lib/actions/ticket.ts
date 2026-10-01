"use server"

import { refresh } from "next/cache"
import { createTicket, type CreateTicketError } from "@/lib/ticket"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Ticket } from "@/models/Ticket"

const errorMessages: Record<CreateTicketError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado.",
  invalid_input: "Preencha todos os campos.",
  invalid_type: "Escolha bug ou melhoria.",
  invalid_title: "Informe o título.",
  title_too_long: "O título pode ter no máximo 120 caracteres.",
  invalid_description: "Descreva o bug ou a melhoria.",
  description_too_long: "A descrição pode ter no máximo 5000 caracteres.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type TicketActionState = { error: string | null }

// workspaceId vem do cliente; o acesso é conferido aqui, no servidor.
export async function createTicketAction(
  workspaceId: string,
  _prev: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)

  const result = await createTicket(
    { type: formData.get("type"), title: formData.get("title"), description: formData.get("description") },
    { workspaceId, userId, actor: access?.actor ?? null },
    async (data) => {
      const ticket = await Ticket.create(data)
      return { id: ticket._id.toString() }
    },
  )
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
