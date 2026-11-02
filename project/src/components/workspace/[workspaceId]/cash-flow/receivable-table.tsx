import { currencyFormat } from "@/components/shared/service-format"
import { SettleReceivableSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PendingReceivable } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

type Props = {
  workspaceId: string
  receivables: PendingReceivable[]
  showUnit: boolean
  canSettle: boolean
}

export function ReceivableTable({ workspaceId, receivables, showUnit, canSettle }: Props) {
  const columns = 3 + Number(showUnit) + Number(canSettle)

  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Descrição</TableHead>
            {showUnit && <TableHead className="px-4 @max-xl:hidden">Unidade</TableHead>}
            <TableHead className="px-4 @max-md:hidden">Data</TableHead>
            <TableHead className="px-4 text-right">Valor</TableHead>
            {canSettle && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum recebível pendente.
              </TableCell>
            </TableRow>
          )}
          {receivables.map((receivable) => (
            <TableRow key={receivable.id}>
              <TableCell className="max-w-0 px-4 font-medium">
                <span className="block truncate">{receivable.name}</span>
              </TableCell>
              {showUnit && (
                <TableCell className="px-4 whitespace-nowrap @max-xl:hidden">{receivable.unitName ?? "—"}</TableCell>
              )}
              <TableCell className="px-4 tabular-nums @max-md:hidden">{dayFormat.format(new Date(receivable.accruedAt))}</TableCell>
              <TableCell className="px-4 text-right tabular-nums">{currencyFormat.format(receivable.valueCents / 100)}</TableCell>
              {canSettle && (
                <TableCell className="px-4 text-right">
                  <SettleReceivableSheet workspaceId={workspaceId} receivable={receivable} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
