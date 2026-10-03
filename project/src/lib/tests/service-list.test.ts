import { describe, it, expect } from "vitest";
import { parseServiceListQuery, serviceListPipeline } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service-list";

describe("parseServiceListQuery", () => {
  it("usa busca vazia e ordenação por nome crescente quando não há parâmetros", () => {
    expect(parseServiceListQuery({})).toEqual({ q: "", sort: "name", dir: "asc" });
  });

  it("lê busca, campo e direção válidos", () => {
    expect(parseServiceListQuery({ q: "massagem", sort: "priceCents", dir: "desc" })).toEqual({
      q: "massagem",
      sort: "priceCents",
      dir: "desc",
    });
  });

  it("aceita ordenação por durationMinutes", () => {
    expect(parseServiceListQuery({ sort: "durationMinutes" }).sort).toBe("durationMinutes");
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseServiceListQuery({ q: "  massagem  " }).q).toBe("massagem");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(
      parseServiceListQuery({ q: ["a", "b"], sort: ["durationMinutes", "name"], dir: ["desc", "asc"] }),
    ).toEqual({ q: "a", sort: "durationMinutes", dir: "desc" });
  });

  it.each([
    ["campo fora da lista", { sort: "unitId" }],
    ["campo de unidade (não existe em serviço)", { sort: "avatarUrl" }],
    ["campo com operador", { sort: "$where" }],
  ])("volta para nome quando o sort é %s", (_label, params) => {
    expect(parseServiceListQuery(params).sort).toBe("name");
  });

  it("volta para crescente quando a direção é inválida", () => {
    expect(parseServiceListQuery({ dir: "sideways" }).dir).toBe("asc");
  });
});

describe("serviceListPipeline", () => {
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      name: 1,
      priceCents: 1,
      durationMinutes: 1,
      // Produtos padrão, para pré-marcar na edição.
      productIds: { $map: { input: "$productIds", as: "id", in: { $toString: "$$id" } } },
      // Serviço cadastrado antes desses campos exige profissional e aceita qualquer espaço.
      requiresTherapist: { $ifNull: ["$requiresTherapist", true] },
      treatmentRoomIds: { $map: { input: { $ifNull: ["$treatmentRoomIds", []] }, as: "id", in: { $toString: "$$id" } } },
    },
  };

  it("sem busca, só ordena (com _id de desempate) e projeta", () => {
    expect(serviceListPipeline({ q: "", sort: "name", dir: "asc" })).toEqual([
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it.each([
    ["priceCents", "desc", { priceCents: -1, _id: 1 }],
    ["priceCents", "asc", { priceCents: 1, _id: 1 }],
    ["durationMinutes", "desc", { durationMinutes: -1, _id: 1 }],
  ] as const)("ordena por %s %s", (sort, dir, $sort) => {
    expect(serviceListPipeline({ q: "", sort, dir })).toEqual([{ $sort }, PROJECT]);
  });

  it("com busca, filtra o nome sem diferenciar maiúsculas antes de ordenar", () => {
    expect(serviceListPipeline({ q: "massagem", sort: "name", dir: "asc" })).toEqual([
      { $match: { name: { $regex: "massagem", $options: "i" } } },
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = serviceListPipeline({ q: "a.b*(c)", sort: "name", dir: "asc" });

    expect(match).toEqual({ $match: { name: { $regex: "a\\.b\\*\\(c\\)", $options: "i" } } });
  });
});
