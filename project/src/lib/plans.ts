// Sem dependências de servidor: também é importado pela landing (componente de cliente).
// Preços em centavos, como a AbacatePay recebe.

export const PLAN_IDS = ["starter", "growth", "network"] as const

export type PlanId = (typeof PLAN_IDS)[number]

export type Plan = {
  id: PlanId
  name: string
  maxUnits: number
  maxUsers: number
  price: number
}

export const PLANS: readonly Plan[] = [
  { id: "starter", name: "Até 3 unidades", maxUnits: 3, maxUsers: 10, price: 11900 },
  { id: "growth", name: "Até 6 unidades", maxUnits: 6, maxUsers: 20, price: 17900 },
  { id: "network", name: "Até 10 unidades", maxUnits: 10, maxUsers: 50, price: 27900 },
]

export const RECOMMENDED_PLAN_ID: PlanId = "growth"

// Robô, URA, WhatsApp e Instagram vêm em todos os planos e são cobrados à parte pelo uso.
// Média estimada por atendimento: template de utilidade da Meta (~R$ 0,06 com impostos)
// + ~8 trocas no GPT-5.6 Luna (~R$ 0,07), arredondada para cima.
export const AVG_COST_PER_SERVICE_CENTS = 15

// Dias de acesso liberados a cada pagamento confirmado.
export const PLAN_PERIOD_DAYS = 30
