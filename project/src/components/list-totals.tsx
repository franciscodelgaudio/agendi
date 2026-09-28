import { currencyFormat } from "@/components/service-format"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Totais da lista filtrada, num card na linha da busca e dos filtros; o último valor fica em destaque.
export function ListTotals({ items }: { items: { label: string; cents: number }[] }) {
  return (
    <Card size="sm" className="ml-auto flex-row gap-0 divide-x py-0">
      {items.map(({ label, cents }, index) => {
        const highlight = index === items.length - 1
        return (
          <div key={label} className={cn("grid gap-0.5 px-4 py-2", highlight && "bg-muted/50")}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={cn("tabular-nums", highlight ? "text-base font-semibold" : "font-medium")}>
              {currencyFormat.format(cents / 100)}
            </span>
          </div>
        )
      })}
    </Card>
  )
}
