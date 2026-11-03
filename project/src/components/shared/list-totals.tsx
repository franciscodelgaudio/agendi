import { currencyFormat } from "@/components/shared/service-format"
import { cn } from "@/service/_shared/utils"

// Totais da lista filtrada, na linha da busca e dos filtros, com a altura dos campos; o último valor
// fica em destaque. Fica à direita da linha e, quando desce sozinho, vai para a direita da nova linha
// (no celular, ocupa a largura toda, com um total por linha).
export function ListTotals({ items }: { items: { label: string; cents: number }[] }) {
  return (
    <div className="flex grow justify-end">
      <div className="flex w-full flex-col divide-y overflow-hidden rounded-md border sm:h-9 sm:w-auto sm:flex-row sm:divide-x sm:divide-y-0">
        {items.map(({ label, cents }, index) => {
          const highlight = index === items.length - 1
          return (
            <div
              key={label}
              className={cn(
                "flex h-9 items-center justify-between gap-2 px-3 whitespace-nowrap sm:h-auto sm:flex-none",
                highlight && "bg-muted/50",
              )}
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={cn("text-sm tabular-nums", highlight ? "font-semibold" : "font-medium")}>
                {currencyFormat.format(cents / 100)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
