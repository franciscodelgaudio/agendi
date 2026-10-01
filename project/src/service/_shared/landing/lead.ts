const MAX_NAME_LENGTH = 120
const MAX_MESSAGE_LENGTH = 2000

export type CreateLeadError = "invalid_input" | "invalid_name" | "name_too_long" | "invalid_whatsapp" | "message_too_long"
export type CreateLeadResult = { ok: true } | { ok: false; error: CreateLeadError }

export type LeadData = { name: string; whatsapp: string; message: string | null }

// Contato do formulário da landing. "website" é um campo isca: quem o preenche é robô, e recebe
// ok sem nada ser salvo.
export async function createLead(input: unknown, insert: (data: LeadData) => Promise<void>): Promise<CreateLeadResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_input" }

  const { name, whatsapp, message, website } = input as Record<string, unknown>
  if (typeof name !== "string" || typeof whatsapp !== "string") return { ok: false, error: "invalid_input" }
  if (message != null && typeof message !== "string") return { ok: false, error: "invalid_input" }

  const normalizedName = name.trim()
  if (!normalizedName) return { ok: false, error: "invalid_name" }
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" }

  const digits = whatsapp.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 13) return { ok: false, error: "invalid_whatsapp" }

  const normalizedMessage = message?.trim() || null
  if (normalizedMessage && normalizedMessage.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "message_too_long" }

  if (typeof website === "string" && website) return { ok: true }

  await insert({ name: normalizedName, whatsapp: digits, message: normalizedMessage })
  return { ok: true }
}
