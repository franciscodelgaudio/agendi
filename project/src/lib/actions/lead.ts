"use server"

import type { ContactFormState } from "@/components/landing/contact-form"
import { sendLeadEmail } from "@/lib/email"
import { createLead, type CreateLeadError } from "@/lib/lead"
import { Lead } from "@/models/Lead"

const errorMessages: Record<CreateLeadError, string> = {
  invalid_input: "Preencha nome e WhatsApp.",
  invalid_name: "Informe seu nome.",
  name_too_long: "O nome pode ter no máximo 120 caracteres.",
  invalid_whatsapp: "Informe um WhatsApp com DDD.",
  message_too_long: "A mensagem pode ter no máximo 2000 caracteres.",
}

// Pública: formulário de contato da landing. O contato fica salvo em "leads"; o aviso por email
// só sai se LEADS_NOTIFY_EMAIL estiver configurado, e uma falha nele não perde o contato.
export async function submitLeadAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const result = await createLead(
    {
      name: formData.get("name"),
      whatsapp: formData.get("whatsapp"),
      message: formData.get("message"),
      website: formData.get("website"),
    },
    async (data) => {
      await Lead.create(data)
      if (process.env.LEADS_NOTIFY_EMAIL) {
        await sendLeadEmail(data).catch((error) => console.error("Aviso de lead por email falhou", error))
      }
    },
  )
  if (!result.ok) return { status: "error", error: errorMessages[result.error] }
  return { status: "sent", error: null }
}
