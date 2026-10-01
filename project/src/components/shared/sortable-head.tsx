import Link from "@/components/shared/link"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { TableHead } from "@/components/ui/table"
import type { SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list"

type Props<F extends string> = {
  field: F
  label: string
  icon?: LucideIcon
  // Os demais campos da query (busca, data...) são preservados no link.
  query: { q: string; sort: F; dir: SortDir } & Record<string, string>
  pathname: string
  className?: string
}

export function SortableHead<F extends string>({ field, label, icon: LabelIcon, query, pathname, className }: Props<F>) {
  const active = query.sort === field
  // Clicar na coluna ativa inverte a direção; numa coluna nova começa crescente.
  const dir = active && query.dir === "asc" ? "desc" : "asc"
  // Campos vazios (busca, unidade "todas"...) ficam fora da URL.
  const params = new URLSearchParams(Object.entries({ ...query, sort: field, dir }).filter(([, value]) => value))
  const Icon = !active ? ArrowUpDownIcon : query.dir === "asc" ? ArrowUpIcon : ArrowDownIcon

  return (
    <TableHead
      className={cn("px-4", className)}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link
        href={`${pathname}?${params}`}
        replace
        scroll={false}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {LabelIcon && <LabelIcon className="size-4 text-muted-foreground" />}
        {label}
        <Icon className={active ? "size-3.5" : "size-3.5 text-muted-foreground"} />
      </Link>
    </TableHead>
  )
}
