import { Types } from "mongoose"
import { abacatePayEnv } from "@/lib/abacatepay"
import { isAuthorizedAbacateWebhook } from "@/lib/abacatepay-webhook"
import { handleAbacateEvent } from "@/lib/billing"
import { Checkout } from "@/models/Checkout"
import { Workspace } from "@/models/Workspace"

// Webhook da AbacatePay (cadastrar como APP_URL/api/webhooks/abacatepay?webhookSecret=...).
// Fica fora do login (proxy.ts); a autenticidade vem do segredo na URL e da assinatura HMAC.
export async function POST(request: Request) {
  // A assinatura é sobre o corpo cru, então ele é lido como texto antes do JSON.
  const rawBody = await request.text()
  const authorized = isAuthorizedAbacateWebhook(
    {
      rawBody,
      signature: request.headers.get("x-webhook-signature"),
      querySecret: new URL(request.url).searchParams.get("webhookSecret"),
    },
    { secret: abacatePayEnv.webhookSecret(), publicKey: abacatePayEnv.webhookPublicKey() },
  )
  if (!authorized) return new Response("Unauthorized", { status: 401 })

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const toWorkspace = (workspace: { _id: Types.ObjectId; subscription?: { status: string; currentPeriodEnd: Date } | null } | null) =>
    workspace && { id: workspace._id.toString(), subscription: workspace.subscription ?? null }

  // Erro ao gravar sobe como 500 e a AbacatePay reenvia; cobranças já pagas são ignoradas.
  await handleAbacateEvent(
    payload,
    { now: new Date(), acceptDevMode: abacatePayEnv.acceptDevMode() },
    {
      findCheckout: async (id) => {
        if (!Types.ObjectId.isValid(id)) return null
        const checkout = await Checkout.findById(id).lean()
        return (
          checkout && {
            id: checkout._id.toString(),
            userId: checkout.userId.toString(),
            workspaceId: checkout.workspaceId?.toString() ?? null,
            planId: checkout.planId,
            amount: checkout.amount,
            status: checkout.status,
          }
        )
      },
      markPaid: async (id, chargeId) => {
        const { modifiedCount } = await Checkout.updateOne(
          { _id: id, status: "pending" },
          { $set: { status: "paid", paidAt: new Date(), ...(chargeId ? { chargeId } : {}) } },
        )
        return modifiedCount > 0
      },
      markPending: async (id) => {
        await Checkout.updateOne({ _id: id }, { $set: { status: "pending", paidAt: null } })
      },
      findWorkspace: async (workspaceId) =>
        toWorkspace(await Workspace.findById(workspaceId).select("subscription").lean()),
      // O mais antigo, como o workspace padrão de /workspace.
      findOwnedWorkspace: async (userId) =>
        toWorkspace(await Workspace.findOne({ userId }).sort({ createdAt: 1 }).select("subscription").lean()),
      setSubscription: async (workspaceId, subscription) => {
        await Workspace.updateOne({ _id: workspaceId }, { $set: { subscription } })
      },
      createWorkspace: async (data) => {
        const workspace = await Workspace.create(data)
        return { id: workspace._id.toString() }
      },
    },
  )

  return new Response("OK", { status: 200 })
}
