import { BRT_OFFSET_HOURS } from "@/lib/timezone";

const MAX_DESCRIPTION_LENGTH = 80;

// Grupo onde entram as compras de estoque; criado na primeira compra da unidade.
export const SUPPLIES_GROUP_NAME = "Insumos";

type StockChange = { productName: string; previousQuantity: number; quantity: number; costCents: number };

// Aumento de estoque conta como compra pelo preço de custo; diminuir ou manter não gera despesa.
export function stockPurchaseExpense({ productName, previousQuantity, quantity, costCents }: StockChange) {
  const bought = quantity - previousQuantity;
  if (bought <= 0 || costCents <= 0) return null;
  const description = `Compra de ${productName} (${bought} un.)`.slice(0, MAX_DESCRIPTION_LENGTH);
  return { description, amountCents: bought * costCents };
}

// Lança a compra como despesa paga hoje (em Brasília), no grupo de insumos da unidade.
export async function recordStockPurchase(
  change: StockChange & { unitId: string; productId: string },
  {
    ensureGroup,
    insert,
    now,
  }: {
    ensureGroup: (unitId: string, name: string) => Promise<string>;
    insert: (data: {
      unitId: string;
      groupId: string;
      description: string;
      amountCents: number;
      date: string;
      paidAt: Date;
      series: null;
      productId: string;
    }) => Promise<unknown>;
    now: Date;
  },
) {
  const expense = stockPurchaseExpense(change);
  if (!expense) return;

  const groupId = await ensureGroup(change.unitId, SUPPLIES_GROUP_NAME);
  const date = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
  await insert({
    unitId: change.unitId,
    groupId,
    ...expense,
    date,
    paidAt: now,
    series: null,
    productId: change.productId,
  });
}
