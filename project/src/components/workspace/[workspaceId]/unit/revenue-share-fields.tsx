"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { REVENUE_SHARE_PERIODS, type RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { AmountInput } from "@/components/shared/amount-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ownershipLabels, periodLabels, type Ownership } from "@/components/workspace/[workspaceId]/unit/revenue-share-labels"
import { currencyFormat } from "@/components/shared/service-format"

const MAX_TIERS = 10

// Em centésimos: centavos no limite, centésimos de ponto no percentual.
type Tier = { key: number; limit: number | null; percent: number | null }

function toTiers(revenueShare: RevenueShare | null): Tier[] {
  if (!revenueShare) return [{ key: 0, limit: null, percent: null }]
  return revenueShare.tiers.map((tier, key) => ({
    key,
    limit: tier.upToCents,
    percent: Math.round(tier.percent * 100),
  }))
}

type Props = {
  idPrefix: string
  // null = espaço próprio (ou unidade ainda sem regra).
  defaultValue?: RevenueShare | null
}

// Onde a unidade funciona e, se for em estabelecimento parceiro, quanto do
// faturamento fica com ele.
export function RevenueShareFields({ idPrefix, defaultValue = null }: Props) {
  const [ownership, setOwnership] = useState<Ownership>(defaultValue ? "partner" : "own")
  const [period, setPeriod] = useState(defaultValue?.period ?? "monthly")
  const [tiers, setTiers] = useState(() => toTiers(defaultValue))

  function updateTier(key: number, patch: Partial<Tier>) {
    setTiers((current) => current.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)))
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-ownership`}>Onde a unidade funciona?</FieldLabel>
        <Select
          name="ownership"
          items={Object.entries(ownershipLabels).map(([value, label]) => ({ value, label }))}
          value={ownership}
          onValueChange={(value) => setOwnership(value as Ownership)}
          required
        >
          <SelectTrigger id={`${idPrefix}-ownership`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ownershipLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {ownership === "partner" && (
        <>
          <FieldSeparator>Repasse ao estabelecimento</FieldSeparator>
          <FieldDescription>
            Informe o percentual do faturamento que fica com o estabelecimento parceiro. O restante fica com
            a sua empresa.
          </FieldDescription>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-period`}>Período do faturamento</FieldLabel>
            <Select
              name="revenueSharePeriod"
              items={REVENUE_SHARE_PERIODS.map((value) => ({ value, label: periodLabels[value] }))}
              value={period}
              onValueChange={(value) => setPeriod(value as typeof period)}
              required
            >
              <SelectTrigger id={`${idPrefix}-period`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVENUE_SHARE_PERIODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {periodLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Um bloco só, com as faixas em sequência: cada uma começa onde a anterior termina. */}
          <div className="divide-y border">
            {tiers.map((tier, index) => {
              const isLast = index === tiers.length - 1
              const from = index === 0 ? 0 : tiers[index - 1].limit
              const fromText = from === null ? "o limite anterior" : currencyFormat.format(from / 100)
              return (
                <div key={tier.key} className="grid gap-2 p-3">
                  <div className="flex min-h-7 items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {tiers.length === 1
                        ? "Sobre todo o faturamento"
                        : isLast
                          ? `Acima de ${fromText}`
                          : `De ${fromText} até`}
                    </span>
                    {tiers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover faixa ${index + 1}`}
                        onClick={() => setTiers((current) => current.filter((t) => t.key !== tier.key))}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* A ordem dos campos no FormData forma as faixas; a última não tem limite. */}
                    {!isLast && (
                      <AmountInput
                        name="tierLimit"
                        max={100_000_000_000}
                        placeholder="R$ 30.000,00"
                        aria-label={`Limite da faixa ${index + 1}`}
                        value={tier.limit}
                        onValueChange={(limit) => updateTier(tier.key, { limit })}
                        required
                      />
                    )}
                    <AmountInput
                      mode="percent"
                      name="tierPercent"
                      max={10_000}
                      placeholder="% do estabelecimento"
                      aria-label={`Percentual da faixa ${index + 1} que fica com o estabelecimento`}
                      className={isLast ? "col-span-2" : undefined}
                      value={tier.percent}
                      onValueChange={(percent) => updateTier(tier.key, { percent })}
                      required
                    />
                  </div>
                </div>
              )
            })}

            {tiers.length < MAX_TIERS && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() =>
                  setTiers((current) => [
                    ...current,
                    { key: Math.max(...current.map((t) => t.key)) + 1, limit: null, percent: null },
                  ])
                }
              >
                <PlusIcon />
                Adicionar faixa
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
