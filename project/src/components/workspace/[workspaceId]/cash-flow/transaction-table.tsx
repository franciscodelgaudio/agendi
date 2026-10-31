import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { SortableHead } from "@/components/shared/sortable-head"
import { currencyFormat } from "@/components/shared/service-format"
import { TRANSACTION_TYPE_LABELS, TransactionActions } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type {
  TransactionListItem,
  TransactionSortField,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import type { SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list"
import { cn } from "@/service/_shared/utils"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

type Props = {
  workspaceId: string
  transactions: TransactionListItem[]
  query: { q: string; sort: TransactionSortField; dir: SortDir } & Record<string, string>
  pathname: string
  canManage: boolean
}

export function TransactionTable({ workspaceId, transactions, query, pathname, canManage }: Props) {
  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead field="name" label="Descrição" query={query} pathname={pathname} className="w-full" />
            <TableHead className="px-4 @max-xl:hidden">Tipo</TableHead>
            <SortableHead field="paidAt" label="Pagamento" query={query} pathname={pathname} className="@max-md:hidden" />
            <SortableHead field="total" label="Valor" query={query} pathname={pathname} className="text-right" />
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                Nenhuma transação encontrada.
              </TableCell>
            </TableRow>
          )}
          {transactions.map((transaction) => {
            const incoming = transaction.type === "incoming"
            const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon
            return (
              <TableRow key={transaction.id}>
                <TableCell className="max-w-0 px-4 font-medium">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", incoming ? "text-emerald-600" : "text-muted-foreground")} />
                    <span className="truncate">{transaction.name}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 @max-xl:hidden">
                  <Badge variant="secondary">{TRANSACTION_TYPE_LABELS[transaction.type]}</Badge>
                </TableCell>
                <TableCell className="px-4 tabular-nums @max-md:hidden">
                  {transaction.paidAt ? (
                    dayFormat.format(new Date(transaction.paidAt))
                  ) : (
                    <Badge variant="outline">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell className={cn("px-4 text-right tabular-nums", incoming ? "text-emerald-700" : "")}>
                  {incoming ? "" : "−"}
                  {currencyFormat.format(transaction.totalCents / 100)}
                </TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    {!transaction.fromAppointment && <TransactionActions workspaceId={workspaceId} transaction={transaction} />}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
