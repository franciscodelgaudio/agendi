import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  CUSTOMER_LIST_COLLATION,
  CUSTOMER_PAGE_SIZE,
  customerListPipeline,
  parseCustomerListQuery,
} from "@/service/workspace/[workspaceId]/customers/customer-list";

const BASE = { q: "", sort: "name", dir: "asc", page: 1 } as const;
const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("parseCustomerListQuery", () => {
  it("sem parâmetros, não tem busca e ordena por nome crescente na página 1", () => {
    expect(parseCustomerListQuery({})).toEqual(BASE);
  });

  it("lê busca, ordenação, direção e página válidos", () => {
    expect(parseCustomerListQuery({ q: "ana", sort: "createdAt", dir: "desc", page: "3" })).toEqual({
      q: "ana",
      sort: "createdAt",
      dir: "desc",
      page: 3,
    });
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseCustomerListQuery({ q: "  ana  " }).q).toBe("ana");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseCustomerListQuery({ q: ["ana", "bruno"], sort: ["createdAt", "name"] })).toEqual(
      expect.objectContaining({ q: "ana", sort: "createdAt" }),
    );
  });

  it("ignora valores inválidos", () => {
    expect(parseCustomerListQuery({ sort: "cellphone", dir: "up", page: "0" })).toEqual(BASE);
  });

  it.each(["-1", "1.5", "abc", "02"])("volta para a página 1 quando a página é %s", (page) => {
    expect(parseCustomerListQuery({ page }).page).toBe(1);
  });
});

describe("customerListPipeline", () => {
  const workspaceId = new Types.ObjectId(WORKSPACE_ID);

  const paged = (skip: number) => [
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: CUSTOMER_PAGE_SIZE },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              observation: { $ifNull: ["$observation", null] },
              cellphone: { $ifNull: ["$cellphone", null] },
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  type Regex = { $regex: string; $options: string };
  type SearchMatch = { $match: { $or: { name?: Regex; cellphone?: Regex }[] } };

  function searchMatch(q: string) {
    return customerListPipeline(WORKSPACE_ID, { ...BASE, q })[0] as SearchMatch;
  }

  function nameRegex(q: string) {
    const { $regex, $options } = searchMatch(q).$match.$or[0].name!;
    return new RegExp($regex, $options);
  }

  it("mostra 20 clientes por página", () => {
    expect(CUSTOMER_PAGE_SIZE).toBe(20);
  });

  it("ordena sem diferenciar maiúsculas nem acentos", () => {
    expect(CUSTOMER_LIST_COLLATION).toEqual({ locale: "pt", strength: 1 });
  });

  it("sem busca, lista os clientes do workspace por nome e pagina no banco", () => {
    expect(customerListPipeline(WORKSPACE_ID, BASE)).toEqual([
      { $match: { workspaceId } },
      { $sort: { name: 1, _id: 1 } },
      ...paged(0),
    ]);
  });

  it("ordena pela data de cadastro decrescente", () => {
    expect(customerListPipeline(WORKSPACE_ID, { ...BASE, sort: "createdAt", dir: "desc" })).toEqual([
      { $match: { workspaceId } },
      { $sort: { createdAt: -1, _id: 1 } },
      ...paged(0),
    ]);
  });

  it("busca por texto só no nome", () => {
    expect(customerListPipeline(WORKSPACE_ID, { ...BASE, q: "ana" })).toEqual([
      { $match: { workspaceId, $or: [{ name: { $regex: expect.any(String), $options: "i" } }] } },
      { $sort: { name: 1, _id: 1 } },
      ...paged(0),
    ]);
  });

  it("busca com números também procura no celular, só pelos dígitos", () => {
    expect(searchMatch("(11) 98765").$match.$or).toEqual([
      { name: { $regex: expect.any(String), $options: "i" } },
      { cellphone: { $regex: "1198765", $options: "i" } },
    ]);
  });

  it.each([
    ["joao araujo", "João Araújo"],
    ["JOÃO", "joao"],
    ["conceicao", "Conceição"],
    ["ana", "Mariana Souza"],
  ])("a busca %s encontra %s, sem diferenciar maiúsculas nem acentos", (q, value) => {
    expect(nameRegex(q).test(value)).toBe(true);
  });

  it.each([
    ["ana", "Bruno"],
    ["a.b", "axb"],
    ["(", "Ana"],
  ])("a busca %s não encontra %s (caracteres especiais são literais)", (q, value) => {
    expect(nameRegex(q).test(value)).toBe(false);
  });

  it("pula as páginas anteriores depois de filtrar e ordenar", () => {
    expect(customerListPipeline(WORKSPACE_ID, { ...BASE, page: 3 }).slice(-2)).toEqual(paged(40));
  });
});
