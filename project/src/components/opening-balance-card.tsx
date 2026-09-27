import { WalletIcon } from "lucide-react"
import type { OpeningBalance } from "@/lib/opening-balance"

import { toDate } from "@/components/day-field"
import { currencyFormat } from "@/components/service-format"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" })

// balanceCents: saldo inicial mais o líquido real desde o dia dele (null sem saldo inicial).
// O saldo inicial é informado no cadastro da unidade.
export function OpeningBalanceCard({
  openingBalance,
  balanceCents,
}: {
  openingBalance: OpeningBalance | null
  balanceCents: number | null
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
        {openingBalance && balanceCents !== null ? (
          <>
            <div
              className={cn("text-2xl font-semibold tracking-tight tabular-nums", balanceCents < 0 && "text-destructive")}
            >
              {currencyFormat.format(balanceCents / 100)}
            </div>
            <div className="text-xs text-muted-foreground">
              {currencyFormat.format(openingBalance.amountCents / 100)} em{" "}
              {dayFormat.format(toDate(openingBalance.date))}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Saldo não informado</div>
        )}
      </CardContent>
    </Card>
  )
}
