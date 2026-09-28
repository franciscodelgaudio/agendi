// Sem dependências de servidor: também é importado pelo editor de URAs.
// Operações da AgenIA sobre o grafo da URA. Alteram o grafo recebido no lugar e devolvem
// um resultado curto para a IA; o editor só grava quando o usuário salva.
import { MAX_NODES, nodeHandles, reachableIds, type UraGraph, type UraNode } from "@/lib/ura-graph";
import { normalizeNodeData, normalizeText, URA_NODE_TYPES, type UraNodeType } from "@/lib/ura-nodes";

type Fail = { ok: false; reason: string };
type NewId = () => string;

const LAYER_GAP = 180;
const COLUMN_GAP = 300;
const MAX_SUMMARY = 120;

const fail = (reason: string): Fail => ({ ok: false, reason });
const findNode = (g: UraGraph, id: string) => g.nodes.find((n) => n.id === id);
const handleTaken = (g: UraGraph, source: string, handle: string) =>
  g.edges.some((e) => e.source === source && e.sourceHandle === handle);

export function addNode(
  g: UraGraph,
  input: { type: UraNodeType; data?: Record<string, unknown>; connectFrom?: { source: string; sourceHandle?: string } },
  newId: NewId,
): { ok: true; nodeId: string; edgeId?: string } | Fail {
  if (!URA_NODE_TYPES.includes(input.type)) return fail("Tipo de nó desconhecido.");
  if (input.type === "start") return fail("O fluxo já tem o nó de início.");
  if (g.nodes.length >= MAX_NODES) return fail(`O fluxo pode ter no máximo ${MAX_NODES} nós.`);

  const from = input.connectFrom;
  const source = from ? findNode(g, from.source) : undefined;
  const handle = from?.sourceHandle ?? "default";
  if (from) {
    if (!source) return fail("Nó de origem não encontrado.");
    if (!nodeHandles(source).includes(handle)) return fail(`O nó de origem não tem a saída "${handle}".`);
    if (handleTaken(g, source.id, handle)) return fail("Essa saída já está ligada. Remova a conexão antes.");
  }

  const position = source
    ? { x: source.position.x, y: source.position.y + LAYER_GAP }
    : { x: 0, y: Math.max(...g.nodes.map((n) => n.position.y)) + LAYER_GAP };
  const nodeId = newId();
  g.nodes.push({ id: nodeId, type: input.type, position, data: normalizeNodeData(input.type, input.data) } as UraNode);
  if (!source) return { ok: true, nodeId };

  const edgeId = newId();
  g.edges.push({ id: edgeId, source: source.id, target: nodeId, sourceHandle: handle });
  return { ok: true, nodeId, edgeId };
}

// Saídas que somem (opção de menu removida) perdem a conexão, como no editor.
export function updateNode(
  g: UraGraph,
  input: { nodeId: string; data: Record<string, unknown> },
): { ok: true; nodeId: string } | Fail {
  const node = findNode(g, input.nodeId);
  if (!node) return fail("Nó não encontrado.");
  node.data = normalizeNodeData(node.type, { ...node.data, ...input.data }) as never;
  const handles = nodeHandles(node);
  g.edges = g.edges.filter((e) => e.source !== node.id || handles.includes(e.sourceHandle));
  return { ok: true, nodeId: node.id };
}

export function deleteNode(g: UraGraph, input: { nodeId: string }): { ok: true; nodeId: string } | Fail {
  const node = findNode(g, input.nodeId);
  if (!node) return fail("Nó não encontrado.");
  if (node.type === "start") return fail("O nó de início não pode ser removido.");
  g.nodes = g.nodes.filter((n) => n.id !== node.id);
  g.edges = g.edges.filter((e) => e.source !== node.id && e.target !== node.id);
  return { ok: true, nodeId: node.id };
}

// Ligar de novo uma saída ocupada troca o destino.
export function addEdge(
  g: UraGraph,
  input: { source: string; target: string; sourceHandle?: string },
  newId: NewId,
): { ok: true; edgeId: string } | Fail {
  const source = findNode(g, input.source);
  const target = findNode(g, input.target);
  if (!source || !target) return fail("Nó não encontrado.");
  if (source.id === target.id) return fail("Um nó não pode ligar a ele mesmo.");
  if (target.type === "start") return fail("Nenhuma conexão pode chegar ao início.");
  const handle = input.sourceHandle ?? "default";
  if (!nodeHandles(source).includes(handle)) return fail(`O nó de origem não tem a saída "${handle}".`);

  g.edges = g.edges.filter((e) => !(e.source === source.id && e.sourceHandle === handle));
  const edgeId = newId();
  g.edges.push({ id: edgeId, source: source.id, target: target.id, sourceHandle: handle });
  return { ok: true, edgeId };
}

export function deleteEdge(g: UraGraph, input: { source: string; sourceHandle?: string }): { ok: true } | Fail {
  const handle = input.sourceHandle ?? "default";
  if (!handleTaken(g, input.source, handle)) return fail("Essa saída não tem conexão.");
  g.edges = g.edges.filter((e) => !(e.source === input.source && e.sourceHandle === handle));
  return { ok: true };
}

export function readNodes(g: UraGraph, ids: string[]) {
  return ids.flatMap((id) => {
    const node = findNode(g, id);
    return node ? [{ id: node.id, type: node.type, handles: nodeHandles(node), data: node.data }] : [];
  });
}

function cut(value: string) {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > MAX_SUMMARY ? `${line.slice(0, MAX_SUMMARY - 1)}…` : line;
}

// Uma linha que identifica o nó sem trazer todos os dados.
function summarize(node: UraNode) {
  const data = node.data as Record<string, unknown>;
  const main = [data.text, data.message, data.caption].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (node.type === "menu") {
    const options = node.data.options.map((o) => o.label).join(", ");
    return cut(`${main ?? ""} — opções: ${options || "nenhuma"}`);
  }
  if (main) return cut(main);
  return cut(JSON.stringify(data));
}

export function findNodes(g: UraGraph, input: { type?: string; text?: string }) {
  const query = input.text ? normalizeText(input.text) : "";
  return g.nodes
    .filter((n) => !input.type || n.type === input.type)
    .filter((n) => !query || normalizeText(JSON.stringify(n.data)).includes(query))
    .map((n) => ({ id: n.id, type: n.type, summary: summarize(n) }));
}

// Índice do fluxo para o prompt: cada saída com o nó de destino (null quando livre).
export function uraGraphIndex(g: UraGraph) {
  return g.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    summary: summarize(node),
    outputs: Object.fromEntries(
      nodeHandles(node).map((handle) => [
        handle,
        g.edges.find((e) => e.source === node.id && e.sourceHandle === handle)?.target ?? null,
      ]),
    ),
  }));
}

export function removeUnreachable(g: UraGraph): { ok: true; removed: number } {
  const reachable = reachableIds(g);
  const before = g.nodes.length;
  g.nodes = g.nodes.filter((n) => n.type === "start" || reachable.has(n.id));
  const ids = new Set(g.nodes.map((n) => n.id));
  g.edges = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { ok: true, removed: before - g.nodes.length };
}

// Camadas pela distância a partir do início; os nós que ele não alcança ficam numa camada abaixo.
export function layoutGraph(g: UraGraph): { ok: true } {
  const depth = new Map<string, number>();
  const start = g.nodes.find((n) => n.type === "start");
  const queue = start ? [start.id] : [];
  if (start) depth.set(start.id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of g.edges) {
      if (edge.source !== id || depth.has(edge.target)) continue;
      depth.set(edge.target, depth.get(id)! + 1);
      queue.push(edge.target);
    }
  }
  const loose = Math.max(-1, ...depth.values()) + 1;
  const layers = new Map<number, UraNode[]>();
  for (const node of g.nodes) {
    const layer = depth.get(node.id) ?? loose;
    layers.set(layer, [...(layers.get(layer) ?? []), node]);
  }
  for (const [layer, nodes] of layers) {
    nodes.forEach((node, i) => {
      node.position = { x: Math.round((i - (nodes.length - 1) / 2) * COLUMN_GAP), y: layer * LAYER_GAP };
    });
  }
  return { ok: true };
}
