import { WalletIcon } from "lucide-react"
import type { OpeningBalance } from "@/lib/opening-balance"

import { currencyFormat } from "@/components/service-format"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// O dia é do calendário, então é formatado em UTC para não deslocar.
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export function dayLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return dayFormat.format(new Date(Date.UTC(year, month - 1, date)))
}

const listFormat = new Intl.ListFormat("pt-BR")

// balanceCents: saldo inicial mais o líquido real desde o dia dele (null sem carteira).
// Sem saldo inicial (ex.: soma das carteiras), só o saldo aparece. wallet: carteira da unidade;
// sharedWith são as outras unidades quando a carteira é compartilhada, sem divisão.
export function OpeningBalanceCard({
  openingBalance,
  balanceCents,
  wallet,
}: {
  openingBalance: OpeningBalance | null
  balanceCents: number | null
  wallet?: { name: string; sharedWith: string[] } | null
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
            <WalletIcon />
          </span>
          <span className="font-medium">Saldo em caixa</span>
        </div>
        {balanceCents !== null ? (
          <>
            <div
              className={cn("text-2xl font-semibold tracking-tight tabular-nums", balanceCents < 0 && "text-destructive")}
            >
              {currencyFormat.format(balanceCents / 100)}
            </div>
            {openingBalance && (
              <div className="text-xs text-muted-foreground">
                {currencyFormat.format(openingBalance.amountCents / 100)} em {dayLabel(openingBalance.date)}
              </div>
            )}
            {wallet && (
              <div className="text-xs text-muted-foreground">
                Carteira {wallet.name}
                {wallet.sharedWith.length > 0 && `, compartilhada com ${listFormat.format(wallet.sharedWith)}`}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Sem carteira</div>
        )}
      </CardContent>
    </Card>
  )
}
