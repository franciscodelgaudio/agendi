"use client"

import { useState } from "react"
import { PLAN_MODE_LABELS, PLAN_MODE_NOTES, PLAN_MODES, PLANS, type PlanMode } from "@/lib/plans"
import { cn } from "@/lib/utils"

const formatPrice = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`

// Toggle entre as modalidades: troca os preços no cliente, sem recarregar.
// Com workspaceId (tela de planos dentro do app), o pagamento ativa esse workspace.
export function PlansSection({ workspaceId }: { workspaceId?: string }) {
  const [mode, setMode] = useState<PlanMode>("standard")

  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="Modalidade do plano"
        className="flex w-full flex-col gap-1 rounded-[10px] border border-ld-line bg-ld-cream p-1 min-[600px]:w-fit min-[600px]:flex-row"
      >
        {PLAN_MODES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              "rounded-[6px] px-4 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand",
              mode === option ? "bg-ld-brand text-white shadow-sm" : "text-ld-ink-soft hover:text-ld-ink",
            )}
          >
            {PLAN_MODE_LABELS[option]}
          </button>
        ))}
      </div>

      <ul className="overflow-hidden rounded-xl border border-ld-line bg-white">
        {PLANS.map((plan) => (
          <li
            key={plan.id}
            className="grid grid-cols-1 items-center gap-4 border-ld-line p-6 not-last:border-b min-[900px]:grid-cols-[1.3fr_1fr_1.3fr_auto] min-[900px]:gap-8"
          >
            <div>
              <h3 className="text-lg font-semibold text-ld-ink">{plan.name}</h3>
              <p className="text-sm text-ld-ink-soft">
                {plan.maxUnits === 1 ? "1 unidade" : `até ${plan.maxUnits} unidades`}, até {plan.maxUsers} usuários
              </p>
            </div>
            <p className="font-mono text-ld-ink">
              <span className="text-3xl font-semibold tracking-tight" aria-live="polite">
                {formatPrice(plan.prices[mode])}
              </span>
              <span className="text-sm text-ld-ink-soft">/mês</span>
            </p>
            <p className="font-mono text-xs uppercase tracking-wide text-ld-ink-soft">{PLAN_MODE_NOTES[mode]}</p>
            <a
              href={`/assinar?${new URLSearchParams({ plano: plan.id, modalidade: mode, ...(workspaceId ? { workspace: workspaceId } : {}) })}`}
              className="inline-flex h-11 items-center justify-center rounded-[6px] bg-ld-brand px-5 text-sm font-medium text-white transition-colors hover:bg-ld-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand"
              aria-label={`Assinar agora o plano ${plan.name}, ${PLAN_MODE_LABELS[mode]}`}
            >
              Assinar agora
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
