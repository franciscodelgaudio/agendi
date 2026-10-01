import { BedDoubleIcon, CalendarIcon, LeafIcon, TagIcon, UserIcon } from "lucide-react"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { formatUses } from "@/components/workspace/[workspaceId]/shared/stock/product-format"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ProductHistoryKind, ProductHistoryQuery, ProductHistoryRow } from "@/service/workspace/[workspaceId]/stock/products/product-history"
import { dateTimeFormat } from "@/service/_shared/utils"

const kindLabels: Record<ProductHistoryKind, string> = {
  appointment: "Atendimento",
  booking: "Agendamento",
  depletion: "Acabou",
}

type Props = {
  rows: ProductHistoryRow[]
  // Sem a página: ordenar volta para a primeira.
  query: Omit<ProductHistoryQuery, "page">
  pathname: string
  // Usos de cada ciclo, pela data em que o produto acabou (ISO).
  cycleUses: Record<string, number>
  // Agendamentos depois de agora ainda não contam nos números do produto.
  now: Date
}

export function ProductHistoryTable({ rows, query, pathname, cycleUses, now }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-4xl:hidden" />
            <SortableHead field="at" label="Data" icon={CalendarIcon} query={query} pathname={pathname} />
            <TableHead className="px-4">
              <span className="inline-flex items-center gap-1">
                <TagIcon className="size-4 text-muted-foreground" />
                Tipo
              </span>
            </TableHead>
            <SortableHead field="guestName" label="Hóspede" icon={BedDoubleIcon} query={query} pathname={pathname} />
            <TableHead className="w-full px-4 @max-xl:hidden">
              <span className="inline-flex items-center gap-1">
                <LeafIcon className="size-4 text-muted-foreground" />
                Serviços
              </span>
            </TableHead>
            <TableHead className="px-4 @max-3xl:hidden">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="size-4 text-muted-foreground" />
                Profissional
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum registro encontrado.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.kind}-${row.id}-${row.at.getTime()}`}>
                {/* Produto que acabou não é um documento próprio. */}
                {row.kind === "depletion" ? (
                  <TableCell className="px-4 text-muted-foreground @max-4xl:hidden">—</TableCell>
                ) : (
                  <CodeCell id={row.id} className="@max-4xl:hidden" />
                )}
                <TableCell className="px-4 tabular-nums">{dateTimeFormat.format(row.at)}</TableCell>
                <TableCell className="px-4">
                  <span className="inline-flex items-center gap-2">
                    <Badge variant={row.kind === "depletion" ? "default" : "outline"}>{kindLabels[row.kind]}</Badge>
                    {row.kind === "booking" && row.at > now && (
                      <span className="text-xs text-muted-foreground">futuro</span>
                    )}
                  </span>
                </TableCell>
                {row.kind === "depletion" ? (
                  <TableCell colSpan={3} className="px-4 text-muted-foreground">
                    Durou {formatUses(cycleUses[row.at.toISOString()] ?? 0)}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="px-4">
                      <span className="font-medium">{row.guest?.name}</span>
                      <span className="text-muted-foreground"> · Quarto {row.guest?.room}</span>
                    </TableCell>
                    <TableCell className="max-w-0 truncate px-4 text-muted-foreground @max-xl:hidden">
                      {row.services.join(", ")}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground @max-3xl:hidden">{[...new Set(row.therapists)].join(", ")}</TableCell>
                  </>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
