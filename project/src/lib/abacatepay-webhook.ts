import { createHmac, timingSafeEqual } from "node:crypto"

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  return left.length === right.length && timingSafeEqual(left, right)
}

// A AbacatePay manda o segredo do webhook na query (?webhookSecret=) e assina o corpo cru com
// HMAC-SHA256 (base64) usando a chave pública dela, no header X-Webhook-Signature. Exige os dois.
export function isAuthorizedAbacateWebhook(
  request: { rawBody: string; signature: string | null; querySecret: string | null },
  keys: { secret: string | undefined; publicKey: string },
) {
  if (!keys.secret || !request.querySecret || !safeEqual(request.querySecret, keys.secret)) return false
  if (!request.signature) return false
  const expected = createHmac("sha256", keys.publicKey).update(request.rawBody, "utf8").digest("base64")
  return safeEqual(request.signature, expected)
}
