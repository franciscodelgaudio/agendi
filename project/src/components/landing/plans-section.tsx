import { AVG_COST_PER_SERVICE_CENTS, PLANS, RECOMMENDED_PLAN_ID } from "@/lib/plans";
import { cn } from "@/lib/utils";

const formatPrice = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const formatCost = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Com workspaceId (tela de planos dentro do app), o pagamento ativa esse workspace.
export function PlansSection({ workspaceId }: { workspaceId?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4">
        {PLANS.map((plan) => {
          const recommended = plan.id === RECOMMENDED_PLAN_ID;
          return (
            <li
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-6 rounded-xl border bg-white p-6",
                recommended
                  ? "border-2 border-ld-brand shadow-[0_18px_40px_-18px_rgba(23,63,56,0.45)]"
                  : "border-ld-line",
              )}
            >
              {recommended && (
                <span className="absolute -top-3 left-6 rounded-full bg-ld-brand px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-white">
                  Recomendado
                </span>
              )}
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-ld-ink">
                  {plan.name}
                </h3>
                <p className="text-sm text-ld-ink-soft">
                  Até {plan.maxUsers} usuários
                </p>
              </div>
              <p className="font-mono text-ld-ink">
                <span className="text-3xl font-semibold tracking-tight">
                  {formatPrice(plan.price)}
                </span>
                <span className="text-sm text-ld-ink-soft">/mês</span>
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <p className="text-ld-ink">
                  Robô, URA, WhatsApp e Instagram inclusos
                </p>
                <p className="font-medium text-ld-brand">
                  Sem pacote fechado: você paga só o que usar, cerca de{" "}
                  {formatCost(AVG_COST_PER_SERVICE_CENTS)} por atendimento
                </p>
              </div>
              <a
                href={`/assinar?${new URLSearchParams({ plano: plan.id, ...(workspaceId ? { workspace: workspaceId } : {}) })}`}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-[6px] bg-ld-brand px-5 text-sm font-medium text-white transition-colors hover:bg-ld-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand"
                aria-label={`Assinar agora o plano ${plan.name}`}
              >
                Assinar agora
              </a>
            </li>
          );
        })}
        <li className="flex flex-col gap-6 rounded-xl border border-ld-line bg-ld-cream p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-ld-ink">
              Mais de 10 unidades
            </h3>
            <p className="text-sm text-ld-ink-soft">Mais de 50 usuários</p>
          </div>
          <p className="font-mono text-3xl font-semibold tracking-tight text-ld-ink">
            A consultar
          </p>
          <a
            href="/#contato"
            className="mt-auto inline-flex h-11 items-center justify-center rounded-[6px] border border-ld-brand px-5 text-sm font-medium text-ld-brand transition-colors hover:bg-ld-brand hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand"
          >
            Fale com a gente
          </a>
        </li>
      </ul>
    </div>
  );
}
