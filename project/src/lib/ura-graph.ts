// Sem dependências de servidor: também é importado pelo editor de URAs.
import { normalizeNodeData, URA_NODE_TYPES, type UraNodeData, type UraNodeType } from "@/lib/ura-nodes";

export type UraNode<T extends UraNodeType = UraNodeType> = {
  [K in T]: { id: string; type: K; position: { x: number; y: number }; data: UraNodeData[K] };
}[T];

export type UraEdge = { id: string; source: string; target: string; sourceHandle: string };

export type UraGraph = { nodes: UraNode[]; edges: UraEdge[] };

export const MAX_NODES = 200;
const MAX_ID_LENGTH = 64;

// Saídas de cada tipo de nó. Cada saída liga a no máximo um nó.
export function nodeHandles(node: Pick<UraNode, "type" | "data">): string[] {
  switch (node.type) {
    case "start":
    case "sendMessage":
    case "sendMedia":
    case "setVariable":
    case "delay":
      return ["default"];
    case "waitForReply":
      return ["default", "invalid", "timeout"];
    case "menu":
      return [...(node.data as UraNodeData["menu"]).options.map((_, i) => `option_${i}`), "invalid", "timeout"];
    case "condition":
      return ["true", "false"];
    case "chooseService":
    case "chooseSlot":
      return ["default", "empty", "invalid", "timeout"];
    case "createBooking":
      return ["default", "error"];
    case "goTo":
    case "closeConversation":
    case "handoff":
      return [];
  }
}

export function nextNodeId(graph: UraGraph, sourceId: string, handle: string) {
  const edge = graph.edges.find(
    (e) => e.source === sourceId && (e.sourceHandle === handle || (handle === "default" && e.sourceHandle == null)),
  );
  return edge?.target ?? null;
}

export type ParseGraphError = "invalid_graph" | "missing_start" | "multiple_start" | "too_many_nodes";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Valida o grafo que vem do editor e normaliza os dados de cada nó. Arestas que não
// fazem sentido (nó inexistente, saída que o nó não tem, laço, entrada no início ou
// segunda aresta na mesma saída) são descartadas em vez de recusar o grafo todo.
export function parseUraGraph(input: unknown): { ok: true; graph: UraGraph } | { ok: false; error: ParseGraphError } {
  if (!isObject(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return { ok: false, error: "invalid_graph" };
  }

  const nodes: UraNode[] = [];
  const ids = new Set<string>();
  for (const raw of input.nodes) {
    if (!isObject(raw) || !isId(raw.id) || ids.has(raw.id)) return { ok: false, error: "invalid_graph" };
    if (!URA_NODE_TYPES.includes(raw.type as UraNodeType)) return { ok: false, error: "invalid_graph" };
    const position = raw.position;
    if (!isObject(position) || !isCoordinate(position.x) || !isCoordinate(position.y)) {
      return { ok: false, error: "invalid_graph" };
    }
    const type = raw.type as UraNodeType;
    ids.add(raw.id);
    nodes.push({
      id: raw.id,
      type,
      position: { x: position.x, y: position.y },
      data: normalizeNodeData(type, raw.data),
    } as UraNode);
  }

  if (nodes.length > MAX_NODES) return { ok: false, error: "too_many_nodes" };
  const starts = nodes.filter((n) => n.type === "start").length;
  if (starts === 0) return { ok: false, error: "missing_start" };
  if (starts > 1) return { ok: false, error: "multiple_start" };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: UraEdge[] = [];
  const usedHandles = new Set<string>();
  for (const raw of input.edges) {
    if (!isObject(raw) || !isId(raw.id) || !isId(raw.source) || !isId(raw.target)) continue;
    const source = byId.get(raw.source);
    const target = byId.get(raw.target);
    if (!source || !target || source === target || target.type === "start") continue;
    const handle = raw.sourceHandle == null ? "default" : raw.sourceHandle;
    if (typeof handle !== "string" || !nodeHandles(source).includes(handle)) continue;
    const key = `${source.id}\u0000${handle}`;
    if (usedHandles.has(key)) continue;
    usedHandles.add(key);
    edges.push({ id: raw.id, source: source.id, target: target.id, sourceHandle: handle });
  }

  return { ok: true, graph: { nodes, edges } };
}

export type GraphIssueCode =
  | "start_not_connected"
  | "empty_text"
  | "menu_without_options"
  | "missing_media_url"
  | "missing_unit"
  | "missing_target"
  | "unreachable";

export type GraphIssue = { nodeId: string; code: GraphIssueCode };

function contentIssue(node: UraNode, graph: UraGraph, ids: Set<string>): GraphIssueCode | null {
  switch (node.type) {
    case "start":
      return graph.edges.some((e) => e.source === node.id) ? null : "start_not_connected";
    case "sendMessage":
      return node.data.text.trim() ? null : "empty_text";
    case "menu":
      return node.data.options.length ? null : "menu_without_options";
    case "sendMedia":
      return node.data.url.trim() ? null : "missing_media_url";
    case "chooseService":
      return node.data.unitId ? null : "missing_unit";
    case "goTo":
      return ids.has(node.data.targetNodeId) ? null : "missing_target";
    default:
      return null;
  }
}

// Ids dos nós que o início alcança, seguindo arestas e saltos de Ir para.
function reachableIds(graph: UraGraph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const start = graph.nodes.find((n) => n.type === "start");
  const seen = new Set<string>();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.source === id) queue.push(edge.target);
    const node = byId.get(id);
    if (node?.type === "goTo" && byId.has(node.data.targetNodeId)) queue.push(node.data.targetNodeId);
  }
  return seen;
}

// Avisos mostrados no editor; não impedem salvar.
export function graphIssues(graph: UraGraph): GraphIssue[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const reachable = reachableIds(graph);
  const issues: GraphIssue[] = [];
  for (const node of graph.nodes) {
    const code = contentIssue(node, graph, ids);
    if (code) issues.push({ nodeId: node.id, code });
    if (node.type !== "start" && !reachable.has(node.id)) issues.push({ nodeId: node.id, code: "unreachable" });
  }
  return issues;
}
