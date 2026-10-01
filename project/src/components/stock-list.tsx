import { WarehouseIcon } from "lucide-react"

import { StockActions, type StockFormValue, type StockUnitOption } from "@/components/stock-sheets"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const listFormat = new Intl.ListFormat("pt-BR")

// Estoques de várias unidades, com o modo e as unidades de cada um. units só vem para quem
// gerencia o estoque (mostra as ações).
export function StockList({
  stocks,
  workspaceId,
  units,
}: {
  stocks: StockFormValue[]
  workspaceId: string
  units: StockUnitOption[] | null
}) {
  if (stocks.length === 0) {
    return (
      <div className="border px-4 py-6 text-center text-sm text-muted-foreground">
        Cada unidade tem o próprio estoque. Crie um estoque para que várias unidades usem os mesmos produtos.
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
                <WarehouseIcon />
              </span>
              <span className="truncate">{stock.name}</span>
            </CardTitle>
            {units && (
              <CardAction>
                <StockActions workspaceId={workspaceId} units={units} stock={stock} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <div>{stock.distributed ? "Dividido entre as unidades" : "Compartilhado"}</div>
            <div className="text-muted-foreground">
              {stock.units.length === 0 ? "Sem unidades" : listFormat.format(stock.units.map((unit) => unit.name))}
            </div>
            <div className="text-muted-foreground">
              {stock.products.length === 1 ? "1 produto" : `${stock.products.length} produtos`}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
