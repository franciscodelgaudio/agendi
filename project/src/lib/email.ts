import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// APP_URL vem do ambiente (e não do header Host da requisição) para que o link
// do convite não possa apontar para outro domínio.
function appUrl(path: string) {
  if (!process.env.APP_URL) throw new Error("APP_URL não definido no ambiente")
  return new URL(path, process.env.APP_URL).toString()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export async function sendInviteEmail({
  email,
  token,
  workspaceName,
  inviterName,
}: {
  email: string
  token: string
  workspaceName: string
  inviterName: string
}) {
  if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM não definido no ambiente")
  const url = appUrl(`/invite/${token}`)
  const workspace = escapeHtml(workspaceName)
  const inviter = escapeHtml(inviterName)

  // O SDK do Resend não lança em erro de API: devolve { error }.
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Convite para o workspace ${workspaceName}`,
    text: `${inviterName} convidou você para o workspace ${workspaceName}.\n\nAceite o convite: ${url}\n\nO convite vale por 7 dias.`,
    html: `<p><strong>${inviter}</strong> convidou você para o workspace <strong>${workspace}</strong>.</p><p><a href="${url}">Aceitar convite</a></p><p>O convite vale por 7 dias.</p>`,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}

// Aviso de novo contato da landing para a equipe (LEADS_NOTIFY_EMAIL, opcional).
export async function sendLeadEmail(lead: { name: string; whatsapp: string; message: string | null }) {
  if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM não definido no ambiente")
  if (!process.env.LEADS_NOTIFY_EMAIL) throw new Error("LEADS_NOTIFY_EMAIL não definido no ambiente")
  const message = lead.message ?? "(sem mensagem)"

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: process.env.LEADS_NOTIFY_EMAIL,
    subject: `Novo contato pela landing: ${lead.name}`,
    text: `Nome: ${lead.name}\nWhatsApp: ${lead.whatsapp}\n\n${message}`,
    html: `<p><strong>Nome:</strong> ${escapeHtml(lead.name)}<br><strong>WhatsApp:</strong> <a href="https://wa.me/${lead.whatsapp}">${lead.whatsapp}</a></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
