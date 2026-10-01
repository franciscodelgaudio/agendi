import type { WorkspaceRole } from "@/lib/member-role";

// Sem dependências de servidor: também é importado por componentes de cliente.
export const TICKET_TYPES = ["bug", "improvement"] as const;
export const TICKET_STATUSES = ["open", "in_review", "resolved"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 5000;

export type CreateTicketError =
  | "workspace_not_found"
  | "invalid_input"
  | "invalid_type"
  | "invalid_title"
  | "title_too_long"
  | "invalid_description"
  | "description_too_long";

export type CreateTicketResult = { ok: true; ticketId: string } | { ok: false; error: CreateTicketError };

export type TicketData = {
  workspaceId: string;
  userId: string;
  type: TicketType;
  title: string;
  description: string;
};

// Tickets vão para a equipe da Agendi: qualquer membro do workspace pode abrir.
export async function createTicket(
  input: unknown,
  ctx: { workspaceId: string; userId: string; actorRole: WorkspaceRole | null },
  insert: (data: TicketData) => Promise<{ id: string }>,
): Promise<CreateTicketResult> {
  if (!ctx.actorRole) return { ok: false, error: "workspace_not_found" };
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_input" };

  const { type, title, description } = input as Record<string, unknown>;
  if (typeof title !== "string" || typeof description !== "string") return { ok: false, error: "invalid_input" };
  if (!TICKET_TYPES.includes(type as TicketType)) return { ok: false, error: "invalid_type" };

  const normalizedTitle = title.trim();
  if (!normalizedTitle) return { ok: false, error: "invalid_title" };
  if (normalizedTitle.length > MAX_TITLE_LENGTH) return { ok: false, error: "title_too_long" };

  const normalizedDescription = description.trim();
  if (!normalizedDescription) return { ok: false, error: "invalid_description" };
  if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) return { ok: false, error: "description_too_long" };

  const ticket = await insert({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    type: type as TicketType,
    title: normalizedTitle,
    description: normalizedDescription,
  });
  return { ok: true, ticketId: ticket.id };
}
