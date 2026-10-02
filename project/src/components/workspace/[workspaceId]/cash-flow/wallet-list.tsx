import { WalletIcon } from "lucide-react"
import Link from "@/components/shared/link"
import type { WalletView } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"

import { dayLabel } from "@/components/workspace/[workspaceId]/shared/cash-flow/opening-balance-card"
import { currencyFormat } from "@/components/shared/service-format"
import { WalletActions, type WalletUnitOption } from "@/components/workspace/[workspaceId]/cash-flow/wallet-sheets"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/service/_shared/utils"

function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

const listFormat = new Intl.ListFormat("pt-BR")

// Saldo de hoje de cada carteira (o nome leva às despesas e ao planejamento dela); na distribuída, o de cada unidade e o que não foi distribuído.
// units só vem para quem gerencia o caixa (mostra as ações).
export function WalletList({
  wallets,
  workspaceId,
  units,
}: {
  wallets: WalletView[]
  workspaceId: string
  units: WalletUnitOption[] | null
}) {
  if (wallets.length === 0) {
    return (
      <div className="border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhuma carteira. Crie uma para acompanhar o saldo em caixa de uma unidade ou de várias juntas.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {wallets.map((wallet) => {
        const distributed = wallet.undistributedCents !== null
        return (
          <Card key={wallet.id} size="sm">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
                  <WalletIcon />
                </span>
                <Link href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} className="truncate hover:underline">
                  {wallet.name}
                </Link>
              </CardTitle>
              {units && (
                <CardAction>
                  <WalletActions
                    workspaceId={workspaceId}
                    units={units}
                    wallet={{
                      id: wallet.id,
                      name: wallet.name,
                      openingBalance: wallet.openingBalance,
                      units: wallet.units.map(({ id, amountCents }) => ({ id, amountCents })),
                    }}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1">
                <div
                  className={cn(
                    "text-2xl font-semibold tracking-tight tabular-nums",
                    wallet.balanceCents < 0 && "text-destructive",
                  )}
                >
                  {money(wallet.balanceCents)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {money(wallet.openingBalance.amountCents)} em {dayLabel(wallet.openingBalance.date)}
                </div>
              </div>
              {distributed ? (
                <ul className="grid gap-1 text-sm">
                  {wallet.units.map((unit) => (
                    <li key={unit.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{unit.name}</span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          unit.balanceCents !== null && unit.balanceCents < 0 && "text-destructive",
                        )}
                      >
                        {unit.balanceCents === null ? "—" : money(unit.balanceCents)}
                      </span>
                    </li>
                  ))}
                  {wallet.undistributedCents !== 0 && (
                    <li className="flex items-center justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0 truncate">Não distribuído</span>
                      <span className="shrink-0 tabular-nums">{money(wallet.undistributedCents!)}</span>
                    </li>
                  )}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {wallet.units.length === 0
                    ? "Sem unidades"
                    : wallet.units.length === 1
                      ? wallet.units[0].name
                      : `Compartilhada: ${listFormat.format(wallet.units.map((unit) => unit.name))}`}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
