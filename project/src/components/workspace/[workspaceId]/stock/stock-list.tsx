import { ArchiveIcon } from "lucide-react"

import { StockActions, type StockFormValue, type StockUnitOption } from "@/components/workspace/[workspaceId]/stock/stock-sheets"
import type { PayerOption } from "@/components/workspace/[workspaceId]/shared/stock/payer-field"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const listFormat = new Intl.ListFormat("pt-BR")

// Estoques compartilhados, com as unidades de cada um. units só vem para quem gerencia o
// estoque (mostra as ações); catalogs traz, por estoque, os produtos do catálogo que faltam nele e
// payers, quem pode pagar a compra.
export function StockList({
  stocks,
  workspaceId,
  units,
  canLinkWallet,
  catalogs,
  payers,
}: {
  stocks: (StockFormValue & { walletName: string | null })[]
  workspaceId: string
  units: StockUnitOption[] | null
  canLinkWallet: boolean
  catalogs: Record<string, { id: string; name: string }[]>
  payers: Record<string, PayerOption[]>
}) {
  if (stocks.length === 0) {
    return (
      <div className="border px-4 py-6 text-center text-sm text-muted-foreground">
        Cada unidade tem o próprio estoque. Crie um estoque compartilhado para que várias unidades usem uma
        quantidade só de cada produto.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stocks.map((stock) => (
        <Card key={stock.id} size="sm">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
                <ArchiveIcon />
              </span>
              <span className="truncate">{stock.name}</span>
            </CardTitle>
            {units && (
              <CardAction>
                <StockActions
                  workspaceId={workspaceId}
                  units={units}
                  canLinkWallet={canLinkWallet}
                  stock={stock}
                  catalog={catalogs[stock.id] ?? []}
                  payers={payers[stock.id] ?? []}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="grid gap-1 text-sm text-muted-foreground">
            <span>{stock.units.length === 0 ? "Sem unidades" : listFormat.format(stock.units.map((unit) => unit.name))}</span>
            {stock.walletName && <span>Compras pela carteira {stock.walletName}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
