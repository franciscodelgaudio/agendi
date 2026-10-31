import { Resend } from "resend"

// Instanciado sob demanda: o construtor lança sem a chave, e criar no topo do
// módulo quebra o build (o Next avalia o módulo ao coletar dados das páginas).
function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY não definido no ambiente")
  return new Resend(process.env.RESEND_API_KEY)
}

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
  const { error } = await resend().emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Convite para o workspace ${workspaceName}`,
    text: `${inviterName} convidou você para o workspace ${workspaceName}.\n\nAceite o convite: ${url}\n\nO convite vale por 7 dias.`,
    html: `<p><strong>${inviter}</strong> convidou você para o workspace <strong>${workspace}</strong>.</p><p><a href="${url}">Aceitar convite</a></p><p>O convite vale por 7 dias.</p>`,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
