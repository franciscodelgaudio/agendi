import { can, type Actor } from "@/lib/permissions";
import { parseUraGraph, type ParseGraphError, type UraGraph } from "@/lib/ura-graph";
import { defaultNodeData } from "@/lib/ura-nodes";

export const MAX_URA_NAME_LENGTH = 60;

export type UraError =
  | "workspace_not_found"
  | "forbidden"
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "ura_not_found"
  | ParseGraphError;

type Fail = { ok: false; error: UraError };

// URAs mexem no atendimento de todos os canais.
function checkActor(actor: Actor | null): Fail | null {
  if (!actor) return { ok: false, error: "workspace_not_found" };
  if (!can(actor, "uras.manage")) return { ok: false, error: "forbidden" };
  return null;
}

function parseName(value: unknown): { ok: true; name: string } | Fail {
  if (typeof value !== "string") return { ok: false, error: "invalid_input" };
  const name = value.trim();
  if (!name) return { ok: false, error: "invalid_name" };
  if (name.length > MAX_URA_NAME_LENGTH) return { ok: false, error: "name_too_long" };
  return { ok: true, name };
}

export type UraData = { name: string } & UraGraph;

// Nasce inativa, só com o início: é ativada depois de montar o fluxo.
export async function createUra(
  input: unknown,
  ctx: { actor: Actor | null },
  insert: (data: UraData & { active: boolean }) => Promise<{ id: string }>,
): Promise<{ ok: true; uraId: string } | Fail> {
  const denied = checkActor(ctx.actor);
  if (denied) return denied;
  const parsed = parseName((input as Record<string, unknown> | null)?.name);
  if (!parsed.ok) return parsed;

  const ura = await insert({
    name: parsed.name,
    active: false,
    nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: defaultNodeData("start") }],
    edges: [],
  });
  return { ok: true, uraId: ura.id };
}

type UraCtx = { actor: Actor | null; uraId: string | null };

// update devolve false quando a URA não existe (ou não é do workspace).
export async function saveUra(
  input: unknown,
  ctx: UraCtx,
  update: (uraId: string, data: UraData) => Promise<boolean>,
): Promise<{ ok: true } | Fail> {
  const denied = checkActor(ctx.actor);
  if (denied) return denied;
  if (!ctx.uraId) return { ok: false, error: "ura_not_found" };
  const { name, graph } = (input ?? {}) as Record<string, unknown>;
  const parsedName = parseName(name);
  if (!parsedName.ok) return parsedName;
  const parsedGraph = parseUraGraph(graph);
  if (!parsedGraph.ok) return parsedGraph;

  const found = await update(ctx.uraId, { name: parsedName.name, ...parsedGraph.graph });
  return found ? { ok: true } : { ok: false, error: "ura_not_found" };
}

export async function setUraActive(
  active: boolean,
  ctx: UraCtx,
  update: (uraId: string, active: boolean) => Promise<boolean>,
): Promise<{ ok: true } | Fail> {
  const denied = checkActor(ctx.actor);
  if (denied) return denied;
  if (!ctx.uraId) return { ok: false, error: "ura_not_found" };
  return (await update(ctx.uraId, active)) ? { ok: true } : { ok: false, error: "ura_not_found" };
}

export async function deleteUra(ctx: UraCtx, remove: (uraId: string) => Promise<boolean>): Promise<{ ok: true } | Fail> {
  const denied = checkActor(ctx.actor);
  if (denied) return denied;
  if (!ctx.uraId) return { ok: false, error: "ura_not_found" };
  return (await remove(ctx.uraId)) ? { ok: true } : { ok: false, error: "ura_not_found" };
}
