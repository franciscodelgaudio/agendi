import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { PRODUCT_SEARCH_LIMIT, productSearchPipeline } from "@/service/workspace/[workspaceId]/stock/products/product-search";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const WORKSPACE = { workspaceId: new Types.ObjectId(WORKSPACE_ID) };

// Busca do seletor de produtos no catálogo do workspace: poucos resultados por vez, para não
// trazer o catálogo inteiro. O workspace e a ordem por nome usam o índice { workspaceId: 1, name: 1 }.
describe("productSearchPipeline", () => {
  const SORT = { $sort: { name: 1, _id: 1 } };
  const LIMIT = { $limit: PRODUCT_SEARCH_LIMIT };
  const PROJECT = { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } };

  it("limita a 20 resultados", () => {
    expect(PRODUCT_SEARCH_LIMIT).toBe(20);
  });

  it("sem busca, traz os primeiros do catálogo em ordem alfabética", () => {
    expect(productSearchPipeline(WORKSPACE_ID, "")).toEqual([{ $match: WORKSPACE }, SORT, LIMIT, PROJECT]);
  });

  it("com busca, filtra pelo trecho do nome sem diferenciar maiúsculas", () => {
    expect(productSearchPipeline(WORKSPACE_ID, "óleo")).toEqual([
      { $match: { ...WORKSPACE, name: { $regex: "óleo", $options: "i" } } },
      SORT,
      LIMIT,
      PROJECT,
    ]);
  });

  it("ignora espaços nas pontas e busca só com espaços vira sem busca", () => {
    expect(productSearchPipeline(WORKSPACE_ID, "  óleo  ")[0]).toEqual({
      $match: { ...WORKSPACE, name: { $regex: "óleo", $options: "i" } },
    });
    expect(productSearchPipeline(WORKSPACE_ID, "   ")[0]).toEqual({ $match: WORKSPACE });
  });

  it("escapa caracteres especiais de regex", () => {
    expect(productSearchPipeline(WORKSPACE_ID, "creme (100ml)+")[0]).toEqual({
      $match: { ...WORKSPACE, name: { $regex: "creme \\(100ml\\)\\+", $options: "i" } },
    });
  });

  it("corta buscas longas em 80 caracteres, o tamanho máximo do nome", () => {
    const match = productSearchPipeline(WORKSPACE_ID, "a".repeat(200))[0] as { $match: { name: { $regex: string } } };
    expect(match.$match.name.$regex).toBe("a".repeat(80));
  });
});
