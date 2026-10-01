import type { PipelineStage } from "mongoose";
import { ADMIN_ROLE_NAME, can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

// Equipe escolhida no formulário da unidade: qualquer usuário do workspace, administradores inclusive.

export type PlanUnitTeamError = "workspace_not_found" | "forbidden" | "invalid_input" | "invalid_team";

export type UnitTeamPlan = { ok: true; link: string[]; unlink: string[] } | { ok: false; error: PlanUnitTeamError };

type TeamMember = { id: string; linked: boolean };

export function planUnitTeam(selected: unknown, members: TeamMember[], actor: Actor | null): UnitTeamPlan {
  if (!actor) return { ok: false, error: "workspace_not_found" };
  if (!can(actor, "team.manage")) return { ok: false, error: "forbidden" };
  if (!Array.isArray(selected) || !selected.every((id) => typeof id === "string")) {
    return { ok: false, error: "invalid_input" };
  }

  const ids = new Set<string>(selected);
  const selectableIds = new Set(members.map((member) => member.id));
  if ([...ids].some((id) => !selectableIds.has(id))) return { ok: false, error: "invalid_team" };

  return {
    ok: true,
    link: members.filter((member) => !member.linked && ids.has(member.id)).map((member) => member.id),
    unlink: members.filter((member) => member.linked && !ids.has(member.id)).map((member) => member.id),
  };
}

// Usuário que pode ser escolhido no formulário da unidade.
export type TeamCandidate = {
  id: string;
  // Nome da conta; sem conta (convite pendente) ou sem nome, o email.
  name: string;
  image: string | null;
  // Nome da role ("Administrador" para administradores); null para quem ainda não tem.
  roleName: string | null;
  pending: boolean;
  unitIds: string[];
};

// $lookup a partir do workspace: todos os usuários (convites pendentes inclusive), com a
// função e as unidades em que trabalham, ordenados pelo nome.
export function teamCandidatesLookup(as = "team"): PipelineStage.Lookup {
  return {
    $lookup: {
      from: "workspace_members",
      localField: "_id",
      foreignField: "workspaceId",
      as,
      pipeline: [
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $set: { user: { $first: "$user" } } },
        ...memberRoleNameStages(),
        {
          $project: {
            _id: 0,
            id: { $toString: "$_id" },
            roleName: 1,
            name: { $ifNull: ["$user.name", { $ifNull: ["$user.email", "$email"] }] },
            image: { $ifNull: ["$user.image", null] },
            pending: { $eq: [{ $ifNull: ["$userId", null] }, null] },
            unitIds: { $map: { input: { $ifNull: ["$units", []] }, in: { $toString: "$$this.unitId" } } },
          },
        },
        { $sort: { name: 1 } },
      ],
    },
  };
}

// Estágios sobre documentos de workspace_members que adicionam attends: se a role do
// membro realiza atendimentos (comissão sobre os próprios serviços). Administradores
// também podem atender.
export function memberAttendsStages(): PipelineStage.FacetPipelineStage[] {
  return [
    { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "attendsRole" } },
    {
      $set: {
        attends: {
          $or: [{ $eq: ["$admin", true] }, { $in: ["attends", { $ifNull: [{ $first: "$attendsRole.permissions" }, []] }] }],
        },
      },
    },
    { $unset: "attendsRole" },
  ];
}

// Estágios sobre documentos de workspace_members que adicionam roleName: o nome da role,
// "Administrador" para administradores e null para quem ainda não tem role.
export function memberRoleNameStages(): PipelineStage.FacetPipelineStage[] {
  return [
    { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "namedRole" } },
    {
      $set: {
        roleName: {
          $cond: [{ $eq: ["$admin", true] }, ADMIN_ROLE_NAME, { $ifNull: [{ $first: "$namedRole.name" }, null] }],
        },
      },
    },
    { $unset: "namedRole" },
  ];
}

export type RoleOption = { id: string; name: string };

// $lookup a partir do workspace: as roles dele (id e nome), por nome, para filtros e formulários.
export function rolesLookup(as = "roles"): PipelineStage.Lookup {
  return {
    $lookup: {
      from: "roles",
      localField: "_id",
      foreignField: "workspaceId",
      as,
      pipeline: [{ $sort: { name: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
    },
  };
}
