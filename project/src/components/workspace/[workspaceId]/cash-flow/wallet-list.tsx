import Link from "@/components/shared/link"
import { WalletIcon } from "lucide-react"
import { currencyFormat } from "@/components/shared/service-format"
import { WalletActions } from "@/components/workspace/[workspaceId]/cash-flow/wallet-sheets"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import { cn } from "@/service/_shared/utils"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

export function WalletList({
  workspaceId,
  wallets,
  canManage,
}: {
  workspaceId: string
  wallets: WalletListItem[]
  canManage: boolean
}) {
  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full px-4">Carteira</TableHead>
            <TableHead className="px-4 @max-3xl:hidden">Unidades</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Entradas</TableHead>
            <TableHead className="px-4 text-right @max-xl:hidden">Saídas</TableHead>
            <TableHead className="px-4 text-right">Saldo</TableHead>
            {canManage && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {wallets.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="h-24 px-4 text-center text-muted-foreground">
                Nenhuma carteira cadastrada.
              </TableCell>
            </TableRow>
          )}
          {wallets.map((wallet) => (
            <TableRow key={wallet.id}>
              <TableCell className="max-w-0 px-4 font-medium">
                <Link
                  href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <WalletIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{wallet.name}</span>
                </Link>
              </TableCell>
              <TableCell className="px-4 @max-3xl:hidden">
                <div className="flex gap-1">
                  {wallet.units.length === 0 ? (
                    <span className="text-muted-foreground">Sem unidades</span>
                  ) : (
                    wallet.units.map((unit) => (
                      <Badge key={unit.id} variant="secondary">
                        {unit.name}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell className="px-4 text-right tabular-nums @max-xl:hidden">{money(wallet.incomingCents)}</TableCell>
              <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-xl:hidden">
                {wallet.expenseCents ? `−${money(wallet.expenseCents)}` : money(0)}
              </TableCell>
              <TableCell
                className={cn("px-4 text-right font-medium tabular-nums", wallet.balanceCents < 0 && "text-destructive")}
              >
                {money(wallet.balanceCents)}
              </TableCell>
              {canManage && (
                <TableCell className="px-4 text-right">
                  <WalletActions workspaceId={workspaceId} wallet={wallet} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
