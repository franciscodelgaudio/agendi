import { describe, it, expect } from "vitest";
import { planUnitTeam } from "@/lib/unit-team";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const member = (id: string, linked = false) => ({ id, linked });

// Qualquer usuário do workspace pode trabalhar na unidade, administradores inclusive (Alice).
const MEMBERS = [member("ana", true), member("bia"), member("rita", true), member("rosa"), member("alice")];

describe("planUnitTeam", () => {
  it("vincula as selecionadas que ainda não estão e desvincula as que saíram", () => {
    const result = planUnitTeam(["bia", "rita", "rosa"], MEMBERS, ADMIN);

    expect(result).toEqual({ ok: true, link: ["bia", "rosa"], unlink: ["ana"] });
  });

  it("role com permissão de gerenciar a equipe também altera a equipe", () => {
    const result = planUnitTeam(["bia", "rosa"], MEMBERS, actorWith("team.manage"));

    expect(result).toEqual({ ok: true, link: ["bia", "rosa"], unlink: ["ana", "rita"] });
  });

  it("mantém quem já estava vinculada e continua selecionada (sem vincular de novo)", () => {
    const result = planUnitTeam(["ana", "rita"], MEMBERS, ADMIN);

    expect(result).toEqual({ ok: true, link: [], unlink: [] });
  });

  it("nenhuma selecionada desvincula todas", () => {
    const result = planUnitTeam([], MEMBERS, ADMIN);

    expect(result).toEqual({ ok: true, link: [], unlink: ["ana", "rita"] });
  });

  it("ids repetidos contam uma vez só", () => {
    const result = planUnitTeam(["bia", "bia", "ana", "rita"], MEMBERS, ADMIN);

    expect(result).toEqual({ ok: true, link: ["bia"], unlink: [] });
  });

  it("administradora entra e sai da equipe como qualquer pessoa", () => {
    expect(planUnitTeam(["ana", "rita", "alice"], MEMBERS, ADMIN)).toEqual({ ok: true, link: ["alice"], unlink: [] });
    expect(planUnitTeam(["rita"], [member("alice", true), member("rita")], ADMIN)).toEqual({
      ok: true,
      link: ["rita"],
      unlink: ["alice"],
    });
  });

  it("id fora dos usuários do workspace → invalid_team", () => {
    expect(planUnitTeam(["bia", "desconhecida"], MEMBERS, ADMIN)).toEqual({ ok: false, error: "invalid_team" });
  });

  it.each([null, undefined, "bia", [1], ["bia", null]])("seleção %j → invalid_input", (selected) => {
    expect(planUnitTeam(selected, MEMBERS, ADMIN)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("sem acesso ao workspace → workspace_not_found", () => {
    expect(planUnitTeam(["bia"], MEMBERS, null)).toEqual({ ok: false, error: "workspace_not_found" });
  });

  it.each([
    ["role sem permissões", STAFF],
    ["role que só gerencia unidades", actorWith("units.manage")],
  ] as const)("%s não gerencia a equipe → forbidden", (_label, actor) => {
    expect(planUnitTeam(["rosa"], MEMBERS, actor)).toEqual({ ok: false, error: "forbidden" });
  });
});
