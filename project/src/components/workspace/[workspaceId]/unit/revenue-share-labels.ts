import type { RevenueSharePeriod } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"

// Nomes na interface; no código e no banco ficam em inglês.
export const ownershipLabels = {
  own: "Espaço próprio",
  partner: "Estabelecimento parceiro",
} as const

export type Ownership = keyof typeof ownershipLabels

export const periodLabels: Record<RevenueSharePeriod, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
}
