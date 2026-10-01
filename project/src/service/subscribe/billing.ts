import { PLANS, type PlanId } from "@/service/subscribe/plans"

const DAY = 24 * 60 * 60 * 1000

export type Subscription = {
  planId: PlanId
  status: "active"
  paidAt: Date
  currentPeriodEnd: Date
}

export type StartCheckoutError = "unauthenticated" | "invalid_plan" | "workspace_not_found"
export type StartCheckoutResult = { ok: true; url: string } | { ok: false; error: StartCheckoutError }

type StartCheckoutDeps = {
  ownsWorkspace: (workspaceId: string, userId: string) => Promise<boolean>
  insertCheckout: (data: {
    userId: string
    workspaceId: string | null
    planId: PlanId
    amount: number
  }) => Promise<{ id: string }>
  createCharge: (data: {
    checkoutId: string
    planId: PlanId
    amount: number
    email: string
    name: string
  }) => Promise<{ chargeId: string; url: string }>
  attachCharge: (checkoutId: string, chargeId: string) => Promise<void>
}

// Registra a cobrança pendente com o valor da tabela de planos e cria o checkout na AbacatePay.
// Sem workspaceId, o pagamento ativa o workspace mais antigo do usuário (ou cria um).
export async function startCheckout(
  input: unknown,
  ctx: { userId: string | null; email: string; name: string },
  deps: StartCheckoutDeps,
): Promise<StartCheckoutResult> {
  if (!ctx.userId) return { ok: false, error: "unauthenticated" }

  const { plan: planId, workspaceId } = (input ?? {}) as Record<string, unknown>
  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return { ok: false, error: "invalid_plan" }

  const targetWorkspaceId = typeof workspaceId === "string" && workspaceId ? workspaceId : null
  if (targetWorkspaceId && !(await deps.ownsWorkspace(targetWorkspaceId, ctx.userId))) {
    return { ok: false, error: "workspace_not_found" }
  }

  const amount = plan.price
  const checkout = await deps.insertCheckout({
    userId: ctx.userId,
    workspaceId: targetWorkspaceId,
    planId: plan.id,
    amount,
  })
  const charge = await deps.createCharge({
    checkoutId: checkout.id,
    planId: plan.id,
    amount,
    email: ctx.email,
    name: ctx.name,
  })
  await deps.attachCharge(checkout.id, charge.chargeId)
  return { ok: true, url: charge.url }
}

export type AbacateEventResult = "activated" | "ignored" | "duplicate" | "amount_mismatch" | "not_found"

type CheckoutRecord = {
  id: string
  userId: string
  workspaceId: string | null
  planId: PlanId
  amount: number
  status: "pending" | "paid"
}

type WorkspaceRecord = { id: string; subscription: { status: string; currentPeriodEnd: Date } | null }

type AbacateEventDeps = {
  findCheckout: (id: string) => Promise<CheckoutRecord | null>
  // Marca como paga só se ainda estiver pendente; false = outra entrega chegou antes.
  markPaid: (id: string, chargeId: string) => Promise<boolean>
  markPending: (id: string) => Promise<void>
  findWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>
  findOwnedWorkspace: (userId: string) => Promise<WorkspaceRecord | null>
  setSubscription: (workspaceId: string, subscription: Subscription) => Promise<void>
  createWorkspace: (data: { name: string; userId: string; subscription: Subscription }) => Promise<{ id: string }>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

// Webhook checkout.completed: libera os dias de acesso do plano no workspace da cobrança.
export async function handleAbacateEvent(
  payload: unknown,
  ctx: { now: Date; acceptDevMode: boolean },
  deps: AbacateEventDeps,
): Promise<AbacateEventResult> {
  if (!isObject(payload) || payload.event !== "checkout.completed") return "ignored"
  if (payload.devMode === true && !ctx.acceptDevMode) return "ignored"
  const charge = isObject(payload.data) && isObject(payload.data.checkout) ? payload.data.checkout : null
  if (!charge || charge.status !== "PAID") return "ignored"
  const { id: chargeId, externalId, paidAmount } = charge
  if (typeof externalId !== "string" || !externalId || typeof paidAmount !== "number") return "ignored"

  const checkout = await deps.findCheckout(externalId)
  if (!checkout) return "not_found"
  if (checkout.status === "paid") return "duplicate"
  if (paidAmount < checkout.amount) return "amount_mismatch"
  if (!(await deps.markPaid(checkout.id, typeof chargeId === "string" ? chargeId : ""))) return "duplicate"

  try {
    const workspace = checkout.workspaceId
      ? await deps.findWorkspace(checkout.workspaceId)
      : await deps.findOwnedWorkspace(checkout.userId)

    // Renovação antes do vencimento soma ao fim do período atual.
    const currentEnd = workspace?.subscription?.currentPeriodEnd?.getTime() ?? 0
    const start = Math.max(ctx.now.getTime(), currentEnd)
    const { periodDays } = PLANS.find((p) => p.id === checkout.planId)!
    const subscription: Subscription = {
      planId: checkout.planId,
      status: "active",
      paidAt: ctx.now,
      currentPeriodEnd: new Date(start + periodDays * DAY),
    }

    if (workspace) await deps.setSubscription(workspace.id, subscription)
    else await deps.createWorkspace({ name: "Meu negócio", userId: checkout.userId, subscription })
  } catch (error) {
    // Libera a cobrança para a próxima entrega do webhook tentar de novo.
    await deps.markPending(checkout.id)
    throw error
  }
  return "activated"
}

export function hasActiveSubscription(
  subscription: { status?: string | null; currentPeriodEnd?: Date | null } | null | undefined,
  now: Date,
) {
  return subscription?.status === "active" && !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
}
