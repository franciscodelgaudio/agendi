import type { MemberRole } from "@/lib/member-role";
import type { UnitMemberBonus } from "@/lib/unit-member";
import { first, type SearchParams, type SortDir } from "@/lib/unit-list";

export const UNIT_TEAM_PAGE_SIZE = 20;
// Só massagistas e recepcionistas são vinculadas às unidades.
const ROLES = ["massage_therapist", "receptionist"] as const;
// active: aceitou o convite; pending: convite ainda sem conta.
const STATUSES = ["active", "pending"] as const;
// Comissão e salário podem valer juntos; none: sem comissão, salário nem bônus nesta unidade.
const PAYS = ["commission", "salary", "none"] as const;

export type UnitTeamRole = (typeof ROLES)[number];
export type UnitTeamStatus = (typeof STATUSES)[number];
export type UnitTeamPay = (typeof PAYS)[number];
// role/status/pay vazios = todos.
export type UnitTeamListQuery = {
  q: string;
  dir: SortDir;
  role: UnitTeamRole | "";
  status: UnitTeamStatus | "";
  pay: UnitTeamPay | "";
  page: number;
};

export type UnitTeamListItem = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: MemberRole;
  pending: boolean;
  commissionPercent: number | null;
  salaryCents: number | null;
  bonuses: UnitMemberBonus[];
  startDate: string | null;
  payDay: number | null;
};

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | "" {
  return values.includes(value as T) ? (value as T) : "";
}

export function parseUnitTeamListQuery(params: SearchParams): UnitTeamListQuery {
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    role: oneOf(ROLES, first(params.role)),
    status: oneOf(STATUSES, first(params.status)),
    pay: oneOf(PAYS, first(params.pay)),
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

// Minúsculas e sem acentos, para a busca.
function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function hasPay(member: UnitTeamListItem, pay: UnitTeamPay) {
  if (pay === "commission") return member.commissionPercent !== null;
  if (pay === "salary") return member.salaryCents !== null;
  return member.commissionPercent === null && member.salaryCents === null && member.bonuses.length === 0;
}

// Busca, filtros e ordenação sobre a equipe da unidade (poucas pessoas), e a página pedida.
export function unitTeamListPage(members: UnitTeamListItem[], { q, dir, role, status, pay, page }: UnitTeamListQuery) {
  const term = normalize(q);
  const sortKey = (member: UnitTeamListItem) => member.name ?? member.email;
  const filtered = members
    .filter(
      (member) =>
        (!role || member.role === role) &&
        (!status || (status === "pending") === member.pending) &&
        (!pay || hasPay(member, pay)) &&
        (!term || normalize(member.name ?? "").includes(term) || normalize(member.email).includes(term)),
    )
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "pt-BR", { sensitivity: "base" }) * (dir === "desc" ? -1 : 1));
  const start = (page - 1) * UNIT_TEAM_PAGE_SIZE;
  return { rows: filtered.slice(start, start + UNIT_TEAM_PAGE_SIZE), total: filtered.length };
}
