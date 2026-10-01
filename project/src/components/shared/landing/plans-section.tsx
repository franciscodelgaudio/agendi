"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { AVG_COST_PER_SERVICE_CENTS, PLANS, type PlanId } from "@/service/subscribe/plans";
import { cn } from "@/service/_shared/utils";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const maxUsers = PLANS[0].maxUsers;

// Atendimentos não entram em pacote: cada um é cobrado à parte pelo uso.
const serviceCost = `~${formatBRL(AVG_COST_PER_SERVICE_CENTS)}`;

const ROWS: { label: string; standard: string | boolean; custom: string | boolean }[] = [
  { label: "Usuários ativos", standard: `Até ${maxUsers}`, custom: "A combinar" },
  { label: "Funcionalidades padrão", standard: true, custom: true },
  { label: "Robô, URA, WhatsApp e Instagram", standard: true, custom: true },
  { label: "Custo médio por atendimento", standard: serviceCost, custom: serviceCost },
  { label: "Atualizações do produto", standard: true, custom: true },
  { label: "Correções de bugs", standard: true, custom: true },
  { label: "Infraestrutura padrão", standard: true, custom: true },
  { label: "Backups padrão", standard: true, custom: true },
  { label: "Documentação e tutoriais", standard: true, custom: true },
  { label: "Implantação personalizada", standard: false, custom: true },
  { label: "Treinamento individual", standard: false, custom: true },
  { label: "Consultoria", standard: false, custom: true },
  { label: "Prazo especial para solicitações", standard: false, custom: true },
  { label: "Funcionalidades exclusivas", standard: false, custom: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <span className="whitespace-nowrap text-ld-ink">{value}</span>;
  return value ? (
    <Check aria-label="Incluso" className="mx-auto size-4 text-ld-brand" />
  ) : (
    <Minus aria-label="Não incluso" className="mx-auto size-4 text-ld-ink-soft/50" />
  );
}

const cta =
  "inline-flex h-11 w-full items-center justify-center rounded-[6px] px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand";

// Com workspaceId (tela de planos dentro do app), o pagamento ativa esse workspace.
// Em containers estreitos o nome do recurso vira uma linha própria acima dos valores.
export function PlansSection({ workspaceId }: { workspaceId?: string }) {
  const [planId, setPlanId] = useState<PlanId>("anual");
  const plan = PLANS.find((p) => p.id === planId)!;

  return (
    <div className="flex flex-col gap-3">
      <div className="@container overflow-hidden rounded-xl border border-ld-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ld-line align-top">
              <th scope="col" className="w-full max-w-0 px-4 py-5 text-left align-bottom font-normal @max-lg:hidden @xl:px-6">
                <div className="flex flex-col gap-2">
                  <span className="truncate text-2xl font-semibold tracking-tight text-ld-ink">Compare os planos</span>
                  <span className="truncate font-mono text-[11px] font-medium tracking-wide text-ld-ink-soft uppercase">
                    O que está incluso
                  </span>
                </div>
              </th>
              <th scope="col" className="w-1/2 bg-ld-brand/5 px-2 py-5 text-center font-normal @lg:w-56 @lg:min-w-56">
                <div className="flex flex-col items-center gap-3">
                  <span className="text-lg font-semibold text-ld-ink">Padrão</span>
                  <div className="inline-flex rounded-full border border-ld-line bg-white p-0.5 text-xs font-medium">
                    {PLANS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={p.id === planId}
                        onClick={() => setPlanId(p.id)}
                        className={cn(
                          "rounded-full px-3 py-1 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand",
                          p.id === planId ? "bg-ld-brand text-white" : "text-ld-ink-soft hover:text-ld-ink",
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <p className="font-mono whitespace-nowrap text-ld-ink">
                      <span className="text-xl font-semibold tracking-tight @lg:text-3xl">
                        {formatBRL(plan.monthlyPrice)}
                      </span>
                      <span className="text-sm text-ld-ink-soft">/mês</span>
                    </p>
                    <p className="text-xs whitespace-nowrap text-ld-ink-soft">
                      {plan.price === plan.monthlyPrice ? "Cobrado todo mês" : `${formatBRL(plan.price)} por ano`}
                    </p>
                  </div>
                </div>
              </th>
              <th scope="col" className="w-1/2 bg-ld-cream px-2 py-5 text-center font-normal @lg:w-56 @lg:min-w-56">
                <div className="flex flex-col items-center gap-3">
                  <span className="text-lg font-semibold text-ld-ink">Sob medida</span>
                  <p className="font-mono text-xl font-semibold tracking-tight whitespace-nowrap text-ld-ink @lg:text-3xl">
                    A consultar
                  </p>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <Fragment key={row.label}>
                <tr className="@lg:hidden">
                  <th scope="colgroup" colSpan={2} className="max-w-0 truncate px-4 pt-3 text-left text-xs font-medium text-ld-ink-soft">
                    {row.label}
                  </th>
                </tr>
                <tr className="border-b border-ld-line">
                  <th scope="row" title={row.label} className="w-full max-w-0 truncate px-4 py-3 text-left font-normal text-ld-ink @max-lg:hidden @xl:px-6">
                    {row.label}
                  </th>
                  <td className="bg-ld-brand/5 px-2 py-3 text-center @max-lg:pt-1">
                    <Cell value={row.standard} />
                  </td>
                  <td className="bg-ld-cream px-2 py-3 text-center @max-lg:pt-1">
                    <Cell value={row.custom} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="@max-lg:hidden" />
              <td className="bg-ld-brand/5 px-3 py-5">
                <a
                  href={`/subscribe?${new URLSearchParams({ plan: plan.id, ...(workspaceId ? { workspace: workspaceId } : {}) })}`}
                  className={cn(cta, "bg-ld-brand text-white hover:bg-ld-forest")}
                  aria-label={`Assinar agora o plano ${plan.name.toLowerCase()}`}
                >
                  Assinar agora
                </a>
              </td>
              <td className="bg-ld-cream px-3 py-5">
                <Link href="/#contato" className={cn(cta, "border border-ld-brand text-ld-brand hover:bg-ld-brand hover:text-white")}>
                  Fale com a gente
                </Link>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-center text-xs text-ld-ink-soft">
        Ao assinar, você concorda com os{" "}
        <Link href="/terms" target="_blank" className="underline underline-offset-4 hover:text-ld-ink">
          Termos de uso
        </Link>
      </p>
    </div>
  );
}
