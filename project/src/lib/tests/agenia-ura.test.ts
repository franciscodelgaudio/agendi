import { describe, it, expect } from "vitest";
import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  findNodes,
  layoutGraph,
  readNodes,
  removeUnreachable,
  updateNode,
  uraGraphIndex,
} from "@/service/workspace/[workspaceId]/uras/agenia-ura";
import { MAX_NODES, type UraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph";
import { defaultNodeData } from "@/service/workspace/[workspaceId]/uras/ura-nodes";

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function graph(): UraGraph {
  return {
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, data: defaultNodeData("start") },
      { id: "hello", type: "sendMessage", position: { x: 0, y: 180 }, data: { text: "Olá! Bem-vindo ao spa." } },
      {
        id: "menu",
        type: "menu",
        position: { x: 0, y: 360 },
        data: { ...defaultNodeData("menu"), message: "Escolha", options: [{ label: "Agendar" }, { label: "Falar com alguém" }] },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "hello", sourceHandle: "default" },
      { id: "e2", source: "hello", target: "menu", sourceHandle: "default" },
    ],
  };
}

describe("addNode", () => {
  it("cria o nó com os dados padrão completados e devolve o id", () => {
    const g = graph();
    const result = addNode(g, { type: "sendMessage", data: { text: "  Oi  " } }, ids());
    expect(result).toEqual({ ok: true, nodeId: "id1" });
    const created = g.nodes.find((n) => n.id === "id1");
    expect(created).toMatchObject({ type: "sendMessage", data: { text: "Oi" } });
  });

  it("normaliza dados inválidos em vez de guardá-los", () => {
    const g = graph();
    addNode(g, { type: "delay", data: { seconds: -10, extra: "x" } }, ids());
    expect(g.nodes.at(-1)!.data).toEqual({ seconds: 1 });
  });

  it("liga o nó novo à saída informada e posiciona abaixo da origem", () => {
    const g = graph();
    const result = addNode(g, { type: "handoff", connectFrom: { source: "menu", sourceHandle: "option_1" } }, ids());
    expect(result).toEqual({ ok: true, nodeId: "id1", edgeId: "id2" });
    expect(g.edges.at(-1)).toEqual({ id: "id2", source: "menu", target: "id1", sourceHandle: "option_1" });
    const created = g.nodes.find((n) => n.id === "id1")!;
    expect(created.position.y).toBeGreaterThan(360);
  });

  it("sem saída informada, liga pela default", () => {
    const g = graph();
    g.edges = g.edges.filter((e) => e.id !== "e2");
    addNode(g, { type: "closeConversation", connectFrom: { source: "hello" } }, ids());
    expect(g.edges.at(-1)).toMatchObject({ source: "hello", target: "id1", sourceHandle: "default" });
  });

  it("sem conexão, posiciona abaixo do nó mais baixo", () => {
    const g = graph();
    addNode(g, { type: "sendMessage" }, ids());
    expect(g.nodes.at(-1)!.position.y).toBeGreaterThan(360);
  });

  it("recusa um segundo início", () => {
    const g = graph();
    expect(addNode(g, { type: "start" }, ids())).toEqual({ ok: false, reason: expect.any(String) });
    expect(g.nodes).toHaveLength(3);
  });

  it("recusa tipo desconhecido", () => {
    const g = graph();
    expect(addNode(g, { type: "sendEmail" as never }, ids()).ok).toBe(false);
    expect(g.nodes).toHaveLength(3);
  });

  it("recusa conexão com origem inexistente ou saída que o nó não tem, sem criar o nó", () => {
    const g = graph();
    expect(addNode(g, { type: "sendMessage", connectFrom: { source: "nope" } }, ids()).ok).toBe(false);
    expect(addNode(g, { type: "sendMessage", connectFrom: { source: "menu", sourceHandle: "option_5" } }, ids()).ok).toBe(false);
    expect(g.nodes).toHaveLength(3);
  });

  it("recusa quando a saída já está ligada", () => {
    const g = graph();
    expect(addNode(g, { type: "sendMessage", connectFrom: { source: "start" } }, ids()).ok).toBe(false);
    expect(g.nodes).toHaveLength(3);
  });

  it("respeita o limite de nós", () => {
    const g = graph();
    const next = ids();
    while (g.nodes.length < MAX_NODES) addNode(g, { type: "sendMessage" }, next);
    expect(addNode(g, { type: "sendMessage" }, next).ok).toBe(false);
    expect(g.nodes).toHaveLength(MAX_NODES);
  });
});

describe("updateNode", () => {
  it("mescla os campos informados nos dados atuais e normaliza", () => {
    const g = graph();
    expect(updateNode(g, { nodeId: "menu", data: { message: "Como posso ajudar?" } })).toEqual({ ok: true, nodeId: "menu" });
    const menu = g.nodes.find((n) => n.id === "menu")!;
    expect(menu.data).toMatchObject({ message: "Como posso ajudar?", options: [{ label: "Agendar" }, { label: "Falar com alguém" }] });
  });

  it("remove as conexões de saídas que deixaram de existir", () => {
    const g = graph();
    g.edges.push({ id: "e3", source: "menu", target: "hello", sourceHandle: "option_1" });
    g.edges.push({ id: "e4", source: "menu", target: "hello", sourceHandle: "option_0" });
    updateNode(g, { nodeId: "menu", data: { options: [{ label: "Agendar" }] } });
    expect(g.edges.map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
  });

  it("falha para nó inexistente", () => {
    expect(updateNode(graph(), { nodeId: "x", data: {} })).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("deleteNode", () => {
  it("remove o nó e as conexões ligadas a ele", () => {
    const g = graph();
    expect(deleteNode(g, { nodeId: "hello" })).toEqual({ ok: true, nodeId: "hello" });
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "menu"]);
    expect(g.edges).toEqual([]);
  });

  it("não remove o início", () => {
    const g = graph();
    expect(deleteNode(g, { nodeId: "start" }).ok).toBe(false);
    expect(g.nodes).toHaveLength(3);
  });

  it("falha para nó inexistente", () => {
    expect(deleteNode(graph(), { nodeId: "x" }).ok).toBe(false);
  });
});

describe("addEdge", () => {
  it("liga dois nós pela saída informada", () => {
    const g = graph();
    expect(addEdge(g, { source: "menu", target: "hello", sourceHandle: "option_0" }, ids())).toEqual({ ok: true, edgeId: "id1" });
    expect(g.edges.at(-1)).toEqual({ id: "id1", source: "menu", target: "hello", sourceHandle: "option_0" });
  });

  it("religar uma saída ocupada troca o destino", () => {
    const g = graph();
    addEdge(g, { source: "start", target: "menu" }, ids());
    expect(g.edges.filter((e) => e.source === "start")).toEqual([
      { id: "id1", source: "start", target: "menu", sourceHandle: "default" },
    ]);
  });

  it("recusa laço, destino no início, nó inexistente e saída inválida", () => {
    const g = graph();
    const next = ids();
    expect(addEdge(g, { source: "hello", target: "hello" }, next).ok).toBe(false);
    expect(addEdge(g, { source: "hello", target: "start" }, next).ok).toBe(false);
    expect(addEdge(g, { source: "hello", target: "nope" }, next).ok).toBe(false);
    expect(addEdge(g, { source: "hello", target: "menu", sourceHandle: "timeout" }, next).ok).toBe(false);
    expect(g.edges).toHaveLength(2);
  });
});

describe("deleteEdge", () => {
  it("remove a conexão da saída informada", () => {
    const g = graph();
    expect(deleteEdge(g, { source: "hello" })).toEqual({ ok: true });
    expect(g.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("falha quando a saída não tem conexão", () => {
    expect(deleteEdge(graph(), { source: "menu", sourceHandle: "option_0" }).ok).toBe(false);
  });
});

describe("readNodes", () => {
  it("devolve os dados completos e as saídas dos nós pedidos, ignorando ids inexistentes", () => {
    expect(readNodes(graph(), ["menu", "x"])).toEqual([
      {
        id: "menu",
        type: "menu",
        handles: ["option_0", "option_1", "invalid", "timeout"],
        data: expect.objectContaining({ message: "Escolha" }),
      },
    ]);
  });
});

describe("findNodes", () => {
  it("filtra por tipo", () => {
    expect(findNodes(graph(), { type: "menu" }).map((n) => n.id)).toEqual(["menu"]);
  });

  it("procura texto nos dados sem diferenciar acentos e maiúsculas", () => {
    expect(findNodes(graph(), { text: "BEM-VINDO" }).map((n) => n.id)).toEqual(["hello"]);
    expect(findNodes(graph(), { text: "alguem" }).map((n) => n.id)).toEqual(["menu"]);
  });
});

describe("uraGraphIndex", () => {
  it("lista cada nó com tipo, saídas, destino de cada saída e um resumo curto", () => {
    const index = uraGraphIndex(graph());
    expect(index).toEqual([
      { id: "start", type: "start", summary: expect.any(String), outputs: { default: "hello" } },
      { id: "hello", type: "sendMessage", summary: "Olá! Bem-vindo ao spa.", outputs: { default: "menu" } },
      {
        id: "menu",
        type: "menu",
        summary: expect.stringContaining("Escolha"),
        outputs: { option_0: null, option_1: null, invalid: null, timeout: null },
      },
    ]);
  });

  it("corta resumos longos", () => {
    const g = graph();
    g.nodes[1] = { ...g.nodes[1], data: { text: "a".repeat(500) } } as UraGraph["nodes"][number];
    expect(uraGraphIndex(g)[1].summary.length).toBeLessThanOrEqual(120);
  });
});

describe("removeUnreachable", () => {
  it("remove nós que o início não alcança e suas conexões", () => {
    const g = graph();
    g.nodes.push({ id: "loose", type: "sendMessage", position: { x: 0, y: 0 }, data: { text: "solto" } });
    g.nodes.push({ id: "loose2", type: "closeConversation", position: { x: 0, y: 0 }, data: { message: "" } });
    g.edges.push({ id: "e9", source: "loose", target: "loose2", sourceHandle: "default" });
    expect(removeUnreachable(g)).toEqual({ ok: true, removed: 2 });
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "hello", "menu"]);
    expect(g.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("mantém nós alcançados por Ir para", () => {
    const g = graph();
    g.nodes.push({ id: "jump", type: "goTo", position: { x: 0, y: 0 }, data: { targetNodeId: "target" } });
    g.nodes.push({ id: "target", type: "sendMessage", position: { x: 0, y: 0 }, data: { text: "alvo" } });
    g.edges.push({ id: "e3", source: "menu", target: "jump", sourceHandle: "option_0" });
    expect(removeUnreachable(g)).toEqual({ ok: true, removed: 0 });
  });
});

describe("layoutGraph", () => {
  it("dispõe os nós em camadas de cima para baixo a partir do início, sem sobreposição", () => {
    const g = graph();
    const next = ids();
    addNode(g, { type: "handoff", connectFrom: { source: "menu", sourceHandle: "option_0" } }, next);
    addNode(g, { type: "closeConversation", connectFrom: { source: "menu", sourceHandle: "option_1" } }, next);
    layoutGraph(g);
    const pos = Object.fromEntries(g.nodes.map((n) => [n.id, n.position]));
    expect(pos.start.y).toBeLessThan(pos.hello.y);
    expect(pos.hello.y).toBeLessThan(pos.menu.y);
    expect(pos.menu.y).toBeLessThan(pos.id1.y);
    expect(pos.id1.y).toBe(pos.id3.y);
    expect(pos.id1.x).not.toBe(pos.id3.x);
    const keys = g.nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("coloca os nós soltos numa camada abaixo de todos", () => {
    const g = graph();
    g.nodes.push({ id: "loose", type: "sendMessage", position: { x: 999, y: -999 }, data: { text: "" } });
    layoutGraph(g);
    const loose = g.nodes.find((n) => n.id === "loose")!;
    expect(loose.position.y).toBeGreaterThan(g.nodes.find((n) => n.id === "menu")!.position.y);
  });
});
