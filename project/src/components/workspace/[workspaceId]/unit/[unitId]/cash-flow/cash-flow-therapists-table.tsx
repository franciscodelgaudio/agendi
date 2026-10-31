import type { TherapistAmounts, TherapistSummary } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import type { TherapistSortField } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-list"
import type { SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { currencyFormat } from "@/components/shared/service-format"
import { SortableHead } from "@/components/shared/sortable-head"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

function AmountCells({ amounts }: { amounts: TherapistAmounts }) {
  return (
    <>
      <TableCell className="border-l px-4 text-right text-muted-foreground tabular-nums">{amounts.count}</TableCell>
      <TableCell className="px-4 text-right font-medium tabular-nums">{money(amounts.cents)}</TableCell>
    </>
  )
}

type Props = {
  // Só a página exibida; as somas do rodapé são de todas as encontradas.
  therapists: TherapistSummary[]
  sums: { real: TherapistAmounts }
  // Busca e ordenação atuais (com visão e data), preservadas nos links de ordenação.
  query: { q: string; sort: TherapistSortField; dir: SortDir } & Record<string, string>
  pathname: string
}

export function CashFlowTherapistsTable({ therapists, sums, query, pathname }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead />
            <SortableHead field="name" label="Profissional" query={query} pathname={pathname} className="w-full" />
            <TableHead className="border-l px-4 text-right">Qtd.</TableHead>
            <SortableHead field="real" label="Bruto" query={query} pathname={pathname} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {therapists.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                {query.q ? "Nenhum profissional encontrado." : "Nenhum serviço no período."}
              </TableCell>
            </TableRow>
          ) : (
            therapists.map((therapist) => (
              <TableRow key={therapist.therapistId}>
                <CodeCell id={therapist.therapistId} />
                <TableCell className="max-w-0 truncate px-4">{therapist.therapistName}</TableCell>
                <AmountCells amounts={therapist.real} />
              </TableRow>
            ))
          )}
        </TableBody>
        {therapists.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="px-4 font-semibold" colSpan={2}>
                Total
              </TableCell>
              <AmountCells amounts={sums.real} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  )
}
