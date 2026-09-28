// Sem dependências de servidor: também é importado pela landing (componente de cliente).
// Preços em centavos, como a AbacatePay recebe.

export const PLAN_IDS = ["starter", "growth", "network"] as const
export const PLAN_MODES = ["standard", "communication"] as const

export type PlanId = (typeof PLAN_IDS)[number]
export type PlanMode = (typeof PLAN_MODES)[number]

export type Plan = {
  id: PlanId
  name: string
  maxUnits: number
  maxUsers: number
  prices: Record<PlanMode, number>
}

export const PLANS: readonly Plan[] = [
  { id: "starter", name: "1 unidade", maxUnits: 1, maxUsers: 3, prices: { standard: 11900, communication: 19800 } },
  { id: "growth", name: "Até 5 unidades", maxUnits: 5, maxUsers: 10, prices: { standard: 17900, communication: 25800 } },
  { id: "network", name: "Até 10 unidades", maxUnits: 10, maxUsers: 25, prices: { standard: 27900, communication: 35800 } },
]

export const PLAN_MODE_LABELS: Record<PlanMode, string> = {
  standard: "Sem comunicação",
  communication: "Com robô, URA, WhatsApp e Instagram",
}

export const PLAN_MODE_NOTES: Record<PlanMode, string> = {
  standard: "Sem comunicação automatizada",
  communication: "até 1.000 atendimentos incluídos",
}

// Dias de acesso liberados a cada pagamento confirmado.
export const PLAN_PERIOD_DAYS = 30
