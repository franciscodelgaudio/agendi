import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { productScopeMatch } from "@/lib/product-scope";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const STOCK_ID = "64b7f0c2a1b2c3d4e5f60790";

// Produtos que uma unidade enxerga: os do estoque em que ela está ou, fora de qualquer
// estoque, os que ela cadastrou e não foram para estoque nenhum.
describe("productScopeMatch", () => {
  it("unidade num estoque: os produtos do estoque", () => {
    expect(productScopeMatch({ stockId: STOCK_ID })).toEqual({ stockId: new Types.ObjectId(STOCK_ID) });
  });

  it("unidade fora de qualquer estoque: os produtos dela, sem estoque", () => {
    expect(productScopeMatch({ unitId: UNIT_ID })).toEqual({ unitId: new Types.ObjectId(UNIT_ID), stockId: null });
  });
});
