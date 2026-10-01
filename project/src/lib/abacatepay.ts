import { PLANS, type PlanId } from "@/lib/plans"

const API_URL = "https://api.abacatepay.com/v2"

// Chave pública com que a AbacatePay assina os webhooks (documentação oficial). Pode ser trocada
// pelo ambiente se a AbacatePay rotacionar.
const DEFAULT_WEBHOOK_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"

export const abacatePayEnv = {
  apiKey: () => process.env.ABACATEPAY_API_KEY,
  webhookSecret: () => process.env.ABACATEPAY_WEBHOOK_SECRET,
  webhookPublicKey: () => process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY || DEFAULT_WEBHOOK_PUBLIC_KEY,
  // Aceita eventos de cobranças de teste (chave de dev mode). Nunca ligar em produção.
  acceptDevMode: () => process.env.ABACATEPAY_ACCEPT_DEV_MODE === "true",
}

function appUrl(path: string) {
  if (!process.env.APP_URL) throw new Error("APP_URL não definido no ambiente")
  return new URL(path, process.env.APP_URL).toString()
}

async function request<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const apiKey = abacatePayEnv.apiKey()
  if (!apiKey) throw new Error("ABACATEPAY_API_KEY não definido no ambiente")
  const response = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })
  const json = (await response.json().catch(() => null)) as { data?: T; error?: string | null } | null
  if (!response.ok || !json?.data) {
    throw new Error(`AbacatePay ${path}: ${json?.error ?? response.status}`)
  }
  return json.data
}

// A v2 só cria checkout de produtos do catálogo. Cada plano × preço vira um produto;
// mudar o preço em plans.ts cria um produto novo em vez de alterar o antigo.
async function ensureProduct(planId: PlanId, amount: number) {
  const externalId = `agendi-${planId}-${amount}`
  const [existing] = await request<{ id: string }[]>(`/products/list?${new URLSearchParams({ externalId, status: "ACTIVE" })}`)
  if (existing) return existing.id

  const plan = PLANS.find((p) => p.id === planId)!
  const product = await request<{ id: string }>("/products/create", {
    method: "POST",
    body: {
      externalId,
      name: `Agendi · ${plan.name}`,
      description: `${plan.periodDays} dias de acesso ao Agendi: plano ${plan.name.toLowerCase()}, até ${plan.maxUsers} usuários.`,
      price: amount,
      currency: "BRL",
    },
  })
  return product.id
}

// Checkout avulso (Pix ou cartão) de um plano. O id da nossa cobrança vai como externalId e volta
// no webhook checkout.completed.
export async function createPlanCharge(data: {
  checkoutId: string
  planId: PlanId
  amount: number
  email: string
  name: string
}) {
  const [productId, customer] = await Promise.all([
    ensureProduct(data.planId, data.amount),
    request<{ id: string }>("/customers/create", {
      method: "POST",
      body: { email: data.email, ...(data.name ? { name: data.name } : {}) },
    }),
  ])

  const charge = await request<{ id: string; url: string }>("/checkouts/create", {
    method: "POST",
    body: {
      items: [{ id: productId, quantity: 1 }],
      methods: ["PIX", "CARD"],
      customerId: customer.id,
      externalId: data.checkoutId,
      returnUrl: appUrl("/#planos"),
      completionUrl: appUrl(`/assinar/concluido?cobranca=${data.checkoutId}`),
      metadata: { planId: data.planId },
    },
  })
  return { chargeId: charge.id, url: charge.url }
}
