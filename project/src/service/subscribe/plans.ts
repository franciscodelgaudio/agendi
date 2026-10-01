// Sem dependências de servidor: também é importado pela landing (componente de cliente).
// Preços em centavos, como a AbacatePay recebe.

export const PLAN_IDS = ["mensal", "anual"] as const

export type PlanId = (typeof PLAN_IDS)[number]

export type Plan = {
  id: PlanId
  name: string
  maxUsers: number
  // Valor cobrado de uma vez, que libera periodDays de acesso.
  price: number
  monthlyPrice: number
  periodDays: number
}

export const PLANS: readonly Plan[] = [
  { id: "mensal", name: "Mensal", maxUsers: 15, price: 12999, monthlyPrice: 12999, periodDays: 30 },
  { id: "anual", name: "Anual", maxUsers: 15, price: 107880, monthlyPrice: 8990, periodDays: 365 },
]

// Robô, URA, WhatsApp e Instagram vêm em todos os planos e são cobrados à parte pelo uso.
// Média estimada por atendimento: template de utilidade da Meta (~R$ 0,06 com impostos)
// + ~8 trocas no GPT-5.6 Luna (~R$ 0,07), arredondada para cima.
export const AVG_COST_PER_SERVICE_CENTS = 15
