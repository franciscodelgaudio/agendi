import { describe, it, expect } from "vitest";
import {
  parseUnitTeamListQuery,
  UNIT_TEAM_PAGE_SIZE,
  unitTeamListPage,
  type UnitTeamListItem,
} from "@/lib/unit-team-list";

const BASE = { q: "", dir: "asc", role: "", status: "", pay: "", page: 1 } as const;

function member(overrides: Partial<UnitTeamListItem> & { id: string }): UnitTeamListItem {
  return {
    name: null,
    email: `${overrides.id}@x.com`,
    image: null,
    role: "massage_therapist",
    pending: false,
    commissionPercent: null,
    salaryCents: null,
    bonuses: [],
    startDate: null,
    payDay: null,
    ...overrides,
  };
}

const ANA = member({ id: "ana", name: "Ana Souza", email: "ana@x.com", commissionPercent: 40 });
const BRUNO = member({ id: "bruno", name: "bruno lima", email: "bruno@spa.com", role: "receptionist", salaryCents: 250000 });
const CELIA = member({ id: "celia", name: "Célia Ramos", email: "celia@x.com", role: "receptionist" });
// Convite sem conta: sem nome, ordena e busca pelo email.
const INVITE = member({ id: "invite", email: "davi@x.com", pending: true, commissionPercent: 35 });
const TEAM = [ANA, BRUNO, CELIA, INVITE];

const ids = (rows: UnitTeamListItem[]) => rows.map((row) => row.id);

describe("parseUnitTeamListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena por nome crescente na página 1", () => {
    expect(parseUnitTeamListQuery({})).toEqual(BASE);
  });

  it("lê busca, direção, filtros e página válidos", () => {
    expect(
      parseUnitTeamListQuery({ q: "ana", dir: "desc", role: "receptionist", status: "pending", pay: "salary", page: "3" }),
    ).toEqual({ q: "ana", dir: "desc", role: "receptionist", status: "pending", pay: "salary", page: 3 });
  });

  it.each(["massage_therapist", "receptionist"])("aceita a função %s", (role) => {
    expect(parseUnitTeamListQuery({ role }).role).toBe(role);
  });

  it.each(["owner", "admin"])("ignora a função %s, que não faz parte da equipe da unidade", (role) => {
    expect(parseUnitTeamListQuery({ role }).role).toBe("");
  });

  it.each(["active", "pending"])("aceita o status %s", (status) => {
    expect(parseUnitTeamListQuery({ status }).status).toBe(status);
  });

  it.each(["commission", "salary", "none"])("aceita a remuneração %s", (pay) => {
    expect(parseUnitTeamListQuery({ pay }).pay).toBe(pay);
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseUnitTeamListQuery({ q: "  ana  " }).q).toBe("ana");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseUnitTeamListQuery({ q: ["ana", "bruno"], pay: ["none", "salary"] })).toEqual(
      expect.objectContaining({ q: "ana", pay: "none" }),
    );
  });

  it("ignora valores inválidos", () => {
    expect(parseUnitTeamListQuery({ dir: "up", role: "root", status: "expired", pay: "bonus", page: "0" })).toEqual(BASE);
  });

  it.each(["-1", "1.5", "abc", "02"])("volta para a página 1 quando a página é %s", (page) => {
    expect(parseUnitTeamListQuery({ page }).page).toBe(1);
  });
});

describe("unitTeamListPage", () => {
  it("mostra 20 pessoas por página", () => {
    expect(UNIT_TEAM_PAGE_SIZE).toBe(20);
  });

  it("sem busca nem filtros, devolve todos ordenados pelo nome (ou email, sem nome), sem diferenciar maiúsculas e acentos", () => {
    expect(unitTeamListPage(TEAM, BASE)).toEqual({ rows: [ANA, BRUNO, CELIA, INVITE], total: 4 });
  });

  it("ordena por nome decrescente", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, dir: "desc" }).rows)).toEqual(["invite", "celia", "bruno", "ana"]);
  });

  it("busca no nome sem diferenciar maiúsculas nem acentos", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, q: "CELIA" }).rows)).toEqual(["celia"]);
  });

  it("busca no email", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, q: "spa.com" }).rows)).toEqual(["bruno"]);
  });

  it("filtra pela função", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, role: "receptionist" }).rows)).toEqual(["bruno", "celia"]);
  });

  it("filtra quem já aceitou o convite", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, status: "active" }).rows)).toEqual(["ana", "bruno", "celia"]);
  });

  it("filtra convites pendentes", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, status: "pending" }).rows)).toEqual(["invite"]);
  });

  it("filtra quem ganha comissão", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, pay: "commission" }).rows)).toEqual(["ana", "invite"]);
  });

  it("filtra quem ganha salário", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, pay: "salary" }).rows)).toEqual(["bruno"]);
  });

  it("filtra quem está sem remuneração definida", () => {
    expect(ids(unitTeamListPage(TEAM, { ...BASE, pay: "none" }).rows)).toEqual(["celia"]);
  });

  it("quem ganha comissão e salário aparece nos dois filtros; só com bônus não é 'não definida'", () => {
    const both = member({ id: "both", commissionPercent: 20, salaryCents: 150_000 });
    const bonusOnly = member({ id: "bonus", bonuses: [{ description: "Prêmio", amountCents: 30_000 }] });
    const team = [both, bonusOnly, CELIA];

    expect(ids(unitTeamListPage(team, { ...BASE, pay: "commission" }).rows)).toEqual(["both"]);
    expect(ids(unitTeamListPage(team, { ...BASE, pay: "salary" }).rows)).toEqual(["both"]);
    expect(ids(unitTeamListPage(team, { ...BASE, pay: "none" }).rows)).toEqual(["celia"]);
  });

  it("combina busca e filtros", () => {
    expect(unitTeamListPage(TEAM, { ...BASE, q: "x.com", role: "massage_therapist", status: "active" })).toEqual({
      rows: [ANA],
      total: 1,
    });
  });

  it("devolve só a página pedida, com o total de todas as páginas", () => {
    const many = Array.from({ length: 45 }, (_, i) => member({ id: `m${i}`, name: `Pessoa ${String(i).padStart(2, "0")}` }));
    const second = unitTeamListPage(many, { ...BASE, page: 2 });
    expect(second.total).toBe(45);
    expect(ids(second.rows)).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 20}`));
    expect(ids(unitTeamListPage(many, { ...BASE, page: 3 }).rows)).toEqual(Array.from({ length: 5 }, (_, i) => `m${i + 40}`));
  });

  it("página além da última volta vazia, com o total", () => {
    expect(unitTeamListPage(TEAM, { ...BASE, page: 2 })).toEqual({ rows: [], total: 4 });
  });
});
