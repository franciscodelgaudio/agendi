import { Types } from "mongoose";

// De onde vêm os produtos que uma unidade enxerga: o estoque em que ela está ou, fora de
// qualquer estoque, ela mesma.
export type ProductScope = { stockId: string } | { unitId: string };

// Fora de qualquer estoque, só os produtos da unidade que não foram para estoque nenhum.
export function productScopeMatch(scope: ProductScope) {
  return "stockId" in scope
    ? { stockId: new Types.ObjectId(scope.stockId) }
    : { unitId: new Types.ObjectId(scope.unitId), stockId: null };
}
