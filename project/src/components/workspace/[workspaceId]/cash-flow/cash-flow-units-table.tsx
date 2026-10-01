import Link from "@/components/shared/link"
import type { ExpenseCashFlowAmounts } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { currencyFormat } from "@/components/shared/service-format"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/service/_shared/utils"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

// Com a tabela estreita, somem os custos e o saldo.
const DETAIL = "@max-xl:hidden"

type Row = { id: string; name: string; real: ExpenseCashFlowAmounts; balanceCents: number | null }

function AmountCells({ real, balanceCents }: Pick<Row, "real" | "balanceCents">) {
  const costCents = real.grossCents - real.netCents
  return (
    <>
      <TableCell className="px-4 text-right tabular-nums">{money(real.grossCents)}</TableCell>
      <TableCell className={cn("px-4 text-right text-muted-foreground tabular-nums", DETAIL)}>
        {costCents ? `−${money(costCents)}` : money(0)}
      </TableCell>
      <TableCell className={cn("px-4 text-right font-medium tabular-nums", real.netCents < 0 && "text-destructive")}>
        {money(real.netCents)}
      </TableCell>
      <TableCell className={cn("px-4 text-right tabular-nums", DETAIL, balanceCents !== null && balanceCents < 0 && "text-destructive")}>
        {balanceCents === null ? "—" : money(balanceCents)}
      </TableCell>
    </>
  )
}

// Valores reais do período por unidade; cada nome leva ao caixa da unidade no mesmo período.
export function CashFlowUnitsTable({
  units,
  total,
  query,
  workspaceId,
}: {
  units: Row[]
  total: Pick<Row, "real" | "balanceCents">
  query: Record<string, string>
  workspaceId: string
}) {
  const search = new URLSearchParams(query)

  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Unidade</TableHead>
            <TableHead className="px-4 text-right">Bruto</TableHead>
            <TableHead className={cn("px-4 text-right", DETAIL)}>Custos</TableHead>
            <TableHead className="px-4 text-right">Líquido</TableHead>
            <TableHead className={cn("px-4 text-right whitespace-nowrap", DETAIL)}>Saldo em caixa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                Nenhuma unidade.
              </TableCell>
            </TableRow>
          ) : (
            units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="max-w-0 truncate px-4">
                  <Link
                    href={`/workspace/${workspaceId}/unit/${unit.id}/cash-flow?${search}`}
                    className="hover:underline"
                  >
                    {unit.name}
                  </Link>
                </TableCell>
                <AmountCells real={unit.real} balanceCents={unit.balanceCents} />
              </TableRow>
            ))
          )}
        </TableBody>
        {units.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="px-4 font-semibold">Total</TableCell>
              <AmountCells {...total} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  )
}
