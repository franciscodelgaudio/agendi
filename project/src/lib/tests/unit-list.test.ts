import { describe, it, expect } from "vitest";
import { unitListPipeline, parseUnitListQuery } from "@/lib/unit-list";

describe("parseUnitListQuery", () => {
  it("usa busca vazia e ordenação por nome crescente quando não há parâmetros", () => {
    expect(parseUnitListQuery({})).toEqual({ q: "", sort: "name", dir: "asc" });
  });

  it("lê busca, campo e direção válidos", () => {
    expect(parseUnitListQuery({ q: "central", sort: "createdAt", dir: "desc" })).toEqual({
      q: "central",
      sort: "createdAt",
      dir: "desc",
    });
  });

  it("aceita ordenação por updatedAt", () => {
    expect(parseUnitListQuery({ sort: "updatedAt" }).sort).toBe("updatedAt");
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseUnitListQuery({ q: "  central  " }).q).toBe("central");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseUnitListQuery({ q: ["a", "b"], sort: ["createdAt", "name"], dir: ["desc", "asc"] })).toEqual({
      q: "a",
      sort: "createdAt",
      dir: "desc",
    });
  });

  it.each([
    ["campo fora da lista", { sort: "workspaceId" }],
    ["campo com operador", { sort: "$where" }],
  ])("volta para nome quando o sort é %s", (_label, params) => {
    expect(parseUnitListQuery(params).sort).toBe("name");
  });

  it("volta para crescente quando a direção é inválida", () => {
    expect(parseUnitListQuery({ dir: "sideways" }).dir).toBe("asc");
  });
});

describe("unitListPipeline", () => {
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      name: 1,
      avatarUrl: { $ifNull: ["$avatarUrl", null] },
      // Unidades em espaço próprio não têm regra de repasse.
      revenueShare: { $ifNull: ["$revenueShare", null] },
      // Salas para o formulário de edição, com os ids em texto.
      treatmentRooms: {
        $map: {
          input: "$treatmentRooms",
          as: "room",
          in: { id: { $toString: "$$room._id" }, name: "$$room.name", beds: "$$room.beds" },
        },
      },
      businessHours: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  };

  it("sem busca, só ordena (com _id de desempate) e projeta", () => {
    expect(unitListPipeline({ q: "", sort: "name", dir: "asc" })).toEqual([
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("ordena de forma decrescente pelo campo escolhido", () => {
    expect(unitListPipeline({ q: "", sort: "createdAt", dir: "desc" })).toEqual([
      { $sort: { createdAt: -1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("com busca, filtra o nome sem diferenciar maiúsculas antes de ordenar", () => {
    expect(unitListPipeline({ q: "central", sort: "name", dir: "asc" })).toEqual([
      { $match: { name: { $regex: "central", $options: "i" } } },
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = unitListPipeline({ q: "a.b*(c)", sort: "name", dir: "asc" });

    expect(match).toEqual({ $match: { name: { $regex: "a\\.b\\*\\(c\\)", $options: "i" } } });
  });
});
