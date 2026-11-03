import { money } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { cn } from "@/service/_shared/utils"

export function MoneyPath({ pending, balance }: { pending: React.ReactNode; balance: React.ReactNode }) {
  return (
    <section aria-label="Caminho do dinheiro" className="flex flex-col gap-3 md:flex-row md:items-stretch">
      {pending}
      {balance}
    </section>
  )
}

type CardProps = { label: string; cents: number; hint: string; children?: React.ReactNode }

export function PendingCard({ label, cents, hint, children }: CardProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 bg-accent px-5 py-4 text-accent-foreground">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-2xl font-semibold text-foreground tabular-nums">{money(cents)}</span>
        <span className="text-sm">{hint}</span>
      </div>
      {children}
    </div>
  )
}

export function BalanceCard({ label, cents, hint }: CardProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 border px-5 py-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", cents < 0 && "text-destructive")}>{money(cents)}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </div>
  )
}
