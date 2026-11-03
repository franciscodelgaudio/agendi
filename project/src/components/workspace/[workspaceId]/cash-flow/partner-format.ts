import { currencyFormat } from "@/components/shared/service-format"
import type { PartnerTier, ThresholdRule } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"

const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

export const THRESHOLD_RULE_LABELS: Record<ThresholdRule, string> = { above: "acima de", from: "a partir de" }

export function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

export function percent(bps: number) {
  return `${percentFormat.format(bps / 100)}%`
}

export function tierLabel(thresholdRule: ThresholdRule, tier: PartnerTier, index: number) {
  return index === 0 ? percent(tier.shareBps) : `${percent(tier.shareBps)} ${THRESHOLD_RULE_LABELS[thresholdRule]} ${money(tier.thresholdCents)}`
}

export function tiersSummary({ thresholdRule, tiers }: { thresholdRule: ThresholdRule; tiers: PartnerTier[] }) {
  return tiers.map((tier, index) => tierLabel(thresholdRule, tier, index)).join(", ")
}
