// Sem dependências de servidor: as consultas ao banco chegam por argumento.
import { can, type Actor, type Permission } from "@/lib/permissions";

export type AccessError = "workspace_not_found" | "forbidden";
export type UnitAccessError = AccessError | "unit_not_found";

export type UnitAccessResult =
  | { ok: true; unit: { workspaceId: string; unitId: string } }
  | { ok: false; error: UnitAccessError };

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Sem acesso ao workspace = não encontrado; com acesso, mas sem a permissão = forbidden.
export function checkAccess(actor: Actor | null, permission: Permission): AccessError | null {
  if (!actor) return "workspace_not_found";
  return can(actor, permission) ? null : "forbidden";
}

// A permissão é conferida antes da unidade: sem ela, nem consulta a unidade.
export async function checkUnitAccess(
  access: { id: string; actor: Actor } | null,
  unitId: string,
  permission: Permission,
  unitExists: (workspaceId: string, unitId: string) => Promise<boolean>,
): Promise<UnitAccessResult> {
  const error = checkAccess(access?.actor ?? null, permission);
  if (error) return { ok: false, error };
  if (!OBJECT_ID.test(unitId) || !(await unitExists(access!.id, unitId))) return { ok: false, error: "unit_not_found" };
  return { ok: true, unit: { workspaceId: access!.id, unitId } };
}

const permissionActions: Record<Permission, string> = {
  "units.manage": "gerenciar unidades",
  "services.manage": "gerenciar serviços",
  "bookings.manage": "gerenciar agendamentos",
  "appointments.manage": "gerenciar atendimentos",
  "stock.manage": "gerenciar o estoque",
  "stock.transfer": "transferir produtos entre unidades",
  "cash_flow.manage": "gerenciar o caixa",
  "team.manage": "gerenciar a equipe",
  "users.manage": "gerenciar usuários",
  "inbox.use": "usar as Conversas",
  "channels.manage": "gerenciar canais",
  "uras.manage": "gerenciar URAs",
  "agenia.use": "usar a AgenIA",
  "workspace.manage": "editar o workspace",
  attends: "realizar atendimentos",
};

// Mensagem para quem acessa o workspace, mas a função não libera a ação.
export function forbiddenMessage(permission: Permission) {
  return `Sua função não tem permissão para ${permissionActions[permission]}.`;
}
