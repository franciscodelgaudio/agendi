import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone";
import type { ExpenseOwner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense";

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

// Lança a compra como despesa paga hoje (em Brasília), no grupo de insumos de quem paga: a
// unidade ou a carteira.
export async function recordStockPurchase(
  change: StockChange & { payer: ExpenseOwner; productId: string },
  {
    ensureGroup,
    insert,
    now,
  }: {
    ensureGroup: (payer: ExpenseOwner, name: string) => Promise<string>;
    insert: (data: ExpenseOwner & {
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

  const groupId = await ensureGroup(change.payer, SUPPLIES_GROUP_NAME);
  const date = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
  await insert({
    ...change.payer,
    groupId,
    ...expense,
    date,
    paidAt: now,
    series: null,
    productId: change.productId,
  });
}

export type PurchasePayerResult =
  | { ok: true; payer: ExpenseOwner }
  | { ok: false; error: "invalid_payer" | "stock_has_no_wallet" };

// Quem paga, como vem do campo "payer": "wallet" (a carteira ligada ao estoque) ou o id de uma
// das unidades que usam o estoque. Sem escolha, paga a unidade da página (fallbackUnitId).
export function parsePurchasePayer(
  value: unknown,
  stock: { unitIds: string[]; walletId: string | null },
  fallbackUnitId: string | null,
): PurchasePayerResult {
  if (value == null || value === "") {
    return fallbackUnitId ? { ok: true, payer: { unitId: fallbackUnitId } } : { ok: false, error: "invalid_payer" };
  }
  if (value === "wallet") {
    return stock.walletId ? { ok: true, payer: { walletId: stock.walletId } } : { ok: false, error: "stock_has_no_wallet" };
  }
  if (typeof value === "string" && stock.unitIds.includes(value)) return { ok: true, payer: { unitId: value } };
  return { ok: false, error: "invalid_payer" };
}
