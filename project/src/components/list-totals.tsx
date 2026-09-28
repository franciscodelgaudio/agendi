import { currencyFormat } from "@/components/service-format"

// Totais da lista filtrada, na linha da busca e dos filtros; o último valor fica em destaque.
export function ListTotals({ items }: { items: { label: string; cents: number }[] }) {
  return (
    <dl className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      {items.map(({ label, cents }, index) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={
              index === items.length - 1 ? "font-semibold tabular-nums" : "text-muted-foreground tabular-nums"
            }
          >
            {currencyFormat.format(cents / 100)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
