// Lote de um item de estoque: uma compra, com a quantidade que ainda resta dela e o preço pago
// por unidade. O estoque sai pelo PEPS: o que entrou primeiro sai primeiro.
export type Lot = { quantity: number; unitCostCents: number; purchasedAt: Date };

// Ordem de compra, estável: na mesma data, quem já estava na lista vem antes.
function byPurchase(lots: Lot[]) {
  return [...lots].sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
}

export type ConsumeLotsResult =
  | { ok: true; lots: Lot[]; consumed: Lot[]; costCents: number }
  | { ok: false; error: "insufficient_stock" };

// Tira a quantidade dos lotes mais antigos. consumed são os pedaços que saíram, com o preço de
// cada um; costCents, o custo total deles. Lote que zera sai da lista.
export function consumeLots(lots: Lot[], quantity: number): ConsumeLotsResult {
  const available = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (quantity > available) return { ok: false, error: "insufficient_stock" };

  const remaining: Lot[] = [];
  const consumed: Lot[] = [];
  let missing = quantity;
  for (const lot of byPurchase(lots)) {
    const taken = Math.min(lot.quantity, missing);
    missing -= taken;
    if (taken > 0) consumed.push({ ...lot, quantity: taken });
    if (lot.quantity > taken) remaining.push({ ...lot, quantity: lot.quantity - taken });
  }

  const costCents = consumed.reduce((sum, lot) => sum + lot.quantity * lot.unitCostCents, 0);
  return { ok: true, lots: remaining, consumed, costCents };
}

// Lotes que entram (compra, transferência, estoques que se juntam), em ordem de compra.
export function addLots(lots: Lot[], added: Lot[]): Lot[] {
  return byPurchase([...lots, ...added.filter((lot) => lot.quantity > 0)]);
}

// Quantidade e valor do item; nextUnitCostCents é o preço do lote que sai agora.
export function summarizeLots(lots: Lot[]) {
  const ordered = byPurchase(lots);
  return {
    quantity: ordered.reduce((sum, lot) => sum + lot.quantity, 0),
    valueCents: ordered.reduce((sum, lot) => sum + lot.quantity * lot.unitCostCents, 0),
    nextUnitCostCents: ordered[0]?.unitCostCents ?? null,
  };
}
