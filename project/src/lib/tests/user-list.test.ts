import { describe, it, expect } from "vitest";
import { parseUserListQuery, USER_PAGE_SIZE, userListPage, type UserListItem } from "@/service/workspace/[workspaceId]/users/user-list";

const BASE = { q: "", sort: "name", dir: "asc", role: "", status: "", page: 1 } as const;
// Roles do workspace: o filtro de função usa "admin" ou o id da role.
const THERAPIST_ROLE = "64b7f0c2a1b2c3d4e5f60731";
const RECEPTION_ROLE = "64b7f0c2a1b2c3d4e5f60732";
const therapist = { admin: false, roleId: THERAPIST_ROLE, roleName: "Terapeuta" };
const reception = { admin: false, roleId: RECEPTION_ROLE, roleName: "Recepção" };
const admin = { admin: true, roleId: null, roleName: null };

function person(overrides: Partial<UserListItem> & { id: string }): UserListItem {
  return { name: null, email: `${overrides.id}@x.com`, image: null, ...reception, status: "active", ...overrides };
}

const CARLA = person({ id: "carla", name: "Carla Dona", email: "carla@x.com", ...admin });
const ANA = person({ id: "ana", name: "Ana Souza", email: "ana@x.com", ...therapist });
const BRUNO = person({ id: "bruno", name: "bruno lima", email: "bruno@spa.com", ...admin });
// Convite sem conta: sem nome, ordena e busca pelo email.
const INVITE = person({ id: "invite", email: "davi@x.com", ...therapist, status: "pending" });
const EXPIRED = person({ id: "expired", email: "eva@x.com", ...reception, status: "expired" });
const PEOPLE = [CARLA, ANA, BRUNO, INVITE, EXPIRED];

const ids = (rows: UserListItem[]) => rows.map((row) => row.id);

describe("parseUserListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena por nome crescente na página 1", () => {
    expect(parseUserListQuery({})).toEqual(BASE);
  });

  it("lê busca, ordenação, direção, filtros e página válidos", () => {
    expect(
      parseUserListQuery({ q: "ana", sort: "email", dir: "desc", role: "admin", status: "pending", page: "3" }),
    ).toEqual({ q: "ana", sort: "email", dir: "desc", role: "admin", status: "pending", page: 3 });
  });

  it.each(["admin", THERAPIST_ROLE])("aceita a função %s (administrador ou id de role)", (role) => {
    expect(parseUserListQuery({ role }).role).toBe(role);
  });

  it.each(["owner", "massage_therapist", "receptionist", "64b7f0c2a1b2c3d4e5f6073"])("ignora a função %s", (role) => {
    expect(parseUserListQuery({ role }).role).toBe("");
  });

  it.each(["active", "pending", "expired"])("aceita o status %s", (status) => {
    expect(parseUserListQuery({ status }).status).toBe(status);
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseUserListQuery({ q: "  ana  " }).q).toBe("ana");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseUserListQuery({ q: ["ana", "bruno"], role: ["admin", THERAPIST_ROLE] })).toEqual(
      expect.objectContaining({ q: "ana", role: "admin" }),
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

describe("userListPage", () => {
  it("mostra 20 usuários por página", () => {
    expect(USER_PAGE_SIZE).toBe(20);
  });

  it("sem busca nem filtros, devolve todos ordenados pelo nome (ou email, sem nome), sem diferenciar maiúsculas", () => {
    expect(userListPage(PEOPLE, BASE)).toEqual({
      rows: [ANA, BRUNO, CARLA, INVITE, EXPIRED],
      total: 5,
    });
  });

  it("ordena por nome decrescente", () => {
    expect(ids(userListPage(PEOPLE, { ...BASE, dir: "desc" }).rows)).toEqual([
      "expired",
      "invite",
      "carla",
      "bruno",
      "ana",
    ]);
  });

  it("ordena por email", () => {
    expect(ids(userListPage(PEOPLE, { ...BASE, sort: "email" }).rows)).toEqual([
      "ana",
      "bruno",
      "carla",
      "invite",
      "expired",
    ]);
  });

  it("busca no nome ou no email sem diferenciar maiúsculas", () => {
    expect(ids(userListPage(PEOPLE, { ...BASE, q: "BRUNO" }).rows)).toEqual(["bruno"]);
    expect(ids(userListPage(PEOPLE, { ...BASE, q: "spa.com" }).rows)).toEqual(["bruno"]);
    expect(ids(userListPage(PEOPLE, { ...BASE, q: "davi" }).rows)).toEqual(["invite"]);
  });

  it("busca sem diferenciar acentos", () => {
    const joao = person({ id: "joao", name: "João Araújo" });
    expect(ids(userListPage([joao, ANA], { ...BASE, q: "joao araujo" }).rows)).toEqual(["joao"]);
  });

  it("filtra pela role ou pelos administradores", () => {
    expect(ids(userListPage(PEOPLE, { ...BASE, role: THERAPIST_ROLE }).rows)).toEqual(["ana", "invite"]);
    expect(ids(userListPage(PEOPLE, { ...BASE, role: "admin" }).rows)).toEqual(["bruno", "carla"]);
  });

  it("membro sem role não aparece no filtro de nenhuma role nem no de administradores", () => {
    const noRole = person({ id: "norole", admin: false, roleId: null, roleName: null });

    expect(ids(userListPage([noRole, ANA], { ...BASE, role: THERAPIST_ROLE }).rows)).toEqual(["ana"]);
    expect(ids(userListPage([noRole, CARLA], { ...BASE, role: "admin" }).rows)).toEqual(["carla"]);
  });

  it("filtra por status", () => {
    expect(ids(userListPage(PEOPLE, { ...BASE, status: "active" }).rows)).toEqual(["ana", "bruno", "carla"]);
    expect(ids(userListPage(PEOPLE, { ...BASE, status: "pending" }).rows)).toEqual(["invite"]);
    expect(ids(userListPage(PEOPLE, { ...BASE, status: "expired" }).rows)).toEqual(["expired"]);
  });

  it("combina busca e filtros; o total conta só os que passaram", () => {
    expect(userListPage(PEOPLE, { ...BASE, q: "x.com", role: THERAPIST_ROLE, status: "active" })).toEqual({
      rows: [ANA],
      total: 1,
    });
  });

  it("sem resultado, devolve lista vazia e total 0", () => {
    expect(userListPage(PEOPLE, { ...BASE, q: "ninguém" })).toEqual({ rows: [], total: 0 });
  });

  it("pagina depois de filtrar e ordenar; o total é o de todas as páginas", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      person({ id: `u${String(i).padStart(2, "0")}`, name: `Usuário ${String(i).padStart(2, "0")}` }),
    );
    const page1 = userListPage(many, BASE);
    const page3 = userListPage(many, { ...BASE, page: 3 });
    expect(page1.total).toBe(45);
    expect(ids(page1.rows)).toEqual(ids(many.slice(0, 20)));
    expect(page3).toEqual({ rows: many.slice(40), total: 45 });
  });

  it("página além da última devolve lista vazia com o total", () => {
    expect(userListPage(PEOPLE, { ...BASE, page: 2 })).toEqual({ rows: [], total: 5 });
  });

  it("não altera a lista recebida", () => {
    const input = [...PEOPLE];
    userListPage(input, { ...BASE, dir: "desc" });
    expect(input).toEqual(PEOPLE);
  });
});
