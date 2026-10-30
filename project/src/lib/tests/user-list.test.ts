import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseUserListQuery,
  USER_LIST_COLLATION,
  USER_PAGE_SIZE,
  userListPipeline,
} from "@/service/workspace/[workspaceId]/users/user-list";

const BASE = { q: "", sort: "name", dir: "asc", role: "", status: "", page: 1 } as const;
const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const ADMIN_ROLE = "64b7f0c2a1b2c3d4e5f60730";
const THERAPIST_ROLE = "64b7f0c2a1b2c3d4e5f60731";
const NOW = new Date("2026-10-29T12:00:00.000Z");

describe("parseUserListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena por nome crescente na página 1", () => {
    expect(parseUserListQuery({})).toEqual(BASE);
  });

  it("lê busca, ordenação, direção, filtros e página válidos", () => {
    expect(
      parseUserListQuery({ q: "ana", sort: "email", dir: "desc", role: THERAPIST_ROLE, status: "pending", page: "3" }),
    ).toEqual({ q: "ana", sort: "email", dir: "desc", role: THERAPIST_ROLE, status: "pending", page: 3 });
  });

  it.each([ADMIN_ROLE, THERAPIST_ROLE])("aceita a função %s (id de role)", (role) => {
    expect(parseUserListQuery({ role }).role).toBe(role);
  });

  it.each(["admin", "owner", "massage_therapist", "receptionist", "64b7f0c2a1b2c3d4e5f6073"])("ignora a função %s", (role) => {
    expect(parseUserListQuery({ role }).role).toBe("");
  });

  it.each(["active", "pending", "expired"])("aceita o status %s", (status) => {
    expect(parseUserListQuery({ status }).status).toBe(status);
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseUserListQuery({ q: "  ana  " }).q).toBe("ana");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseUserListQuery({ q: ["ana", "bruno"], role: [ADMIN_ROLE, THERAPIST_ROLE] })).toEqual(
      expect.objectContaining({ q: "ana", role: ADMIN_ROLE }),
    );
  });

  it("ignora valores inválidos", () => {
    expect(
      parseUserListQuery({ sort: "password", dir: "up", role: "root", status: "deleted", page: "0" }),
    ).toEqual(BASE);
  });

  it.each(["-1", "1.5", "abc", "02"])("volta para a página 1 quando a página é %s", (page) => {
    expect(parseUserListQuery({ page }).page).toBe(1);
  });
});

describe("userListPipeline", () => {
  const workspaceId = new Types.ObjectId(WORKSPACE_ID);

  const MEMBERS = [
    { $match: { workspaceId } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
    { $set: { user: { $first: "$user" } } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        roleId: { $toString: "$roleId" },
        email: "$user.email",
        name: { $ifNull: ["$user.name", null] },
        image: { $ifNull: ["$user.avatarUrl", null] },
        status: { $literal: "active" },
      },
    },
    {
      $unionWith: {
        coll: "invites",
        pipeline: [
          { $match: { workspaceId } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              roleId: { $toString: "$roleId" },
              email: 1,
              name: { $literal: null },
              image: { $literal: null },
              status: { $cond: [{ $lte: ["$expiresAt", NOW] }, "expired", "pending"] },
            },
          },
        ],
      },
    },
  ];

  const SORT_BY_NAME = { $set: { sortKey: { $ifNull: ["$name", "$email"] } } };

  const paged = (skip: number) => [
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: USER_PAGE_SIZE }, { $unset: "sortKey" }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  function searchRegex(q: string) {
    const stages = userListPipeline(WORKSPACE_ID, { ...BASE, q }, NOW);
    const match = stages.find((stage) => "$match" in stage && "$or" in (stage.$match as object)) as {
      $match: { $or: { name?: { $regex: string; $options: string }; email?: { $regex: string; $options: string } }[] };
    };
    const { $regex, $options } = match.$match.$or[0].name!;
    return new RegExp($regex, $options);
  }

  it("mostra 20 usuários por página", () => {
    expect(USER_PAGE_SIZE).toBe(20);
  });

  it("ordena sem diferenciar maiúsculas nem acentos", () => {
    expect(USER_LIST_COLLATION).toEqual({ locale: "pt", strength: 1 });
  });

  it("sem busca nem filtros, junta membros e convites do workspace, ordena pelo nome (ou email) e pagina no banco", () => {
    expect(userListPipeline(WORKSPACE_ID, BASE, NOW)).toEqual([
      ...MEMBERS,
      SORT_BY_NAME,
      { $sort: { sortKey: 1, id: 1 } },
      ...paged(0),
    ]);
  });

  it("ordena por email decrescente", () => {
    expect(userListPipeline(WORKSPACE_ID, { ...BASE, sort: "email", dir: "desc" }, NOW)).toEqual([
      ...MEMBERS,
      { $set: { sortKey: "$email" } },
      { $sort: { sortKey: -1, id: 1 } },
      ...paged(0),
    ]);
  });

  it("filtra pela role e pelo status num $match depois de juntar membros e convites", () => {
    expect(userListPipeline(WORKSPACE_ID, { ...BASE, role: ADMIN_ROLE, status: "pending" }, NOW)).toEqual([
      ...MEMBERS,
      { $match: { roleId: ADMIN_ROLE, status: "pending" } },
      SORT_BY_NAME,
      { $sort: { sortKey: 1, id: 1 } },
      ...paged(0),
    ]);
  });

  it("busca no nome ou no email", () => {
    const stages = userListPipeline(WORKSPACE_ID, { ...BASE, q: "ana" }, NOW);
    const regex = { $regex: expect.any(String), $options: "i" };

    expect(stages).toEqual([
      ...MEMBERS,
      { $match: { $or: [{ name: regex }, { email: regex }] } },
      SORT_BY_NAME,
      { $sort: { sortKey: 1, id: 1 } },
      ...paged(0),
    ]);
  });

  it("combina busca e filtros no mesmo $match", () => {
    const stages = userListPipeline(WORKSPACE_ID, { ...BASE, q: "ana", role: THERAPIST_ROLE, status: "active" }, NOW);

    expect(stages[MEMBERS.length]).toEqual({
      $match: {
        roleId: THERAPIST_ROLE,
        status: "active",
        $or: [{ name: expect.any(Object) }, { email: expect.any(Object) }],
      },
    });
  });

  it.each([
    ["joao araujo", "João Araújo"],
    ["JOÃO", "joao"],
    ["conceicao", "Conceição"],
    ["muñoz", "Munoz"],
    ["ana", "Mariana Souza"],
  ])("a busca %s encontra %s, sem diferenciar maiúsculas nem acentos", (q, value) => {
    expect(searchRegex(q).test(value)).toBe(true);
  });

  it.each([
    ["ana", "Bruno"],
    ["a.b", "axb"],
    ["(", "Ana"],
  ])("a busca %s não encontra %s (caracteres especiais são literais)", (q, value) => {
    expect(searchRegex(q).test(value)).toBe(false);
  });

  it("pula as páginas anteriores depois de filtrar e ordenar", () => {
    expect(userListPipeline(WORKSPACE_ID, { ...BASE, page: 3 }, NOW).slice(-2)).toEqual(paged(40));
  });
});
