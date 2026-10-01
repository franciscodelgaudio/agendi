import { decryptSecret, encryptSecret } from "@/service/_shared/security/secret-box"

// Variáveis da integração com a Meta. Os tokens de cada canal ficam no banco;
// aqui ficam só os segredos do app e a chave que encripta esses tokens.
export const messagingEnv = {
  // Segredos dos apps que assinam o webhook (WhatsApp e Instagram podem ser apps diferentes).
  appSecrets: () => [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET],
  verifyToken: () => process.env.META_WEBHOOK_VERIFY_TOKEN,
  graphApiVersion: () => process.env.META_GRAPH_API_VERSION || "v23.0",
}

// Nomes das variáveis que faltam para a integração funcionar. INSTAGRAM_APP_SECRET é
// opcional: só é preciso quando o Instagram usa um app com segredo diferente.
export function missingMessagingEnv() {
  const required = {
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    MESSAGING_ENCRYPTION_KEY: process.env.MESSAGING_ENCRYPTION_KEY,
    APP_URL: process.env.APP_URL,
  }
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name)
}

export const encryptChannelToken = (token: string) => encryptSecret(token, process.env.MESSAGING_ENCRYPTION_KEY)

// null também quando a chave não está configurada: o canal fica indisponível em vez de quebrar a página.
export function decryptChannelToken(payload: string) {
  try {
    return decryptSecret(payload, process.env.MESSAGING_ENCRYPTION_KEY)
  } catch {
    return null
  }
}

// URL que vai no painel da Meta como Callback URL do webhook.
export function webhookUrl() {
  return process.env.APP_URL ? new URL("/api/webhooks/meta", process.env.APP_URL).toString() : null
}
