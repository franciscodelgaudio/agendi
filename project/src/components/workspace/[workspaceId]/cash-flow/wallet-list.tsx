import Link from "@/components/shared/link"
import { currencyFormat } from "@/components/shared/service-format"
import { WalletActions } from "@/components/workspace/[workspaceId]/cash-flow/wallet-sheets"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  if (wallets.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center border border-dashed text-muted-foreground">
        Nenhuma carteira cadastrada.
      </div>
    )
  }

  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {wallets.map((wallet) => (
          <Card key={wallet.id} className="relative">
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Link
                    href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`}
                    className="truncate text-base font-semibold after:absolute after:inset-0 hover:underline"
                  >
                    {wallet.name}
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {wallet.units.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Sem unidade vinculada</span>
                    ) : (
                      wallet.units.map((unit) => (
                        <Badge key={unit.id} variant="secondary">
                          {unit.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="relative z-10 -my-1 shrink-0">
                    <WalletActions workspaceId={workspaceId} wallet={wallet} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Saldo</span>
                <span className={cn("text-2xl font-semibold tabular-nums", wallet.balanceCents < 0 && "text-destructive")}>
                  {money(wallet.balanceCents)}
                </span>
              </div>
              <dl className="grid gap-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Entradas</dt>
                  <dd className="tabular-nums">{money(wallet.incomingCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Saídas</dt>
                  <dd className="tabular-nums">{wallet.expenseCents ? `−${money(wallet.expenseCents)}` : money(0)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
