import { describe, it, expect } from "vitest";
import { graphIssues, nextNodeId, nodeHandles, parseUraGraph, type UraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph";
import { defaultNodeData } from "@/service/workspace/[workspaceId]/uras/ura-nodes";

const CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60719";

const at = { x: 0, y: 0 };

function node(id: string, type: string, data: Record<string, unknown> = {}) {
  return { id, type, position: at, data };
}

function edge(id: string, source: string, target: string, sourceHandle: string | null = "default") {
  return { id, source, target, sourceHandle };
}

describe("nextNodeId", () => {
  const graph = {
    nodes: [],
    edges: [edge("e1", "a", "b", null), edge("e2", "m", "x", "option_1"), edge("e3", "c", "d", "default")],
  } as unknown as UraGraph;

  it("na saída default aceita aresta sem handle ou com handle default", () => {
    expect(nextNodeId(graph, "a", "default")).toBe("b");
    expect(nextNodeId(graph, "c", "default")).toBe("d");
  });

  it("nas outras saídas exige o handle exato", () => {
    expect(nextNodeId(graph, "m", "option_1")).toBe("x");
    expect(nextNodeId(graph, "m", "option_0")).toBeNull();
    expect(nextNodeId(graph, "m", "default")).toBeNull();
  });

  it("devolve null para nó sem saída", () => {
    expect(nextNodeId(graph, "b", "default")).toBeNull();
  });
});

describe("nodeHandles", () => {
  it("lista as saídas de cada tipo de nó", () => {
    expect(nodeHandles({ type: "sendMessage", data: defaultNodeData("sendMessage") })).toEqual(["default"]);
    expect(nodeHandles({ type: "waitForReply", data: defaultNodeData("waitForReply") })).toEqual([
      "default",
      "invalid",
      "timeout",
    ]);
    expect(nodeHandles({ type: "condition", data: defaultNodeData("condition") })).toEqual(["true", "false"]);
    expect(nodeHandles({ type: "handoff", data: defaultNodeData("handoff") })).toEqual([]);
    expect(nodeHandles({ type: "closeConversation", data: defaultNodeData("closeConversation") })).toEqual([]);
    expect(nodeHandles({ type: "goTo", data: defaultNodeData("goTo") })).toEqual([]);
    expect(nodeHandles({ type: "chooseService", data: defaultNodeData("chooseService") })).toEqual([
      "default",
      "empty",
      "invalid",
      "timeout",
    ]);
    expect(nodeHandles({ type: "chooseSlot", data: defaultNodeData("chooseSlot") })).toEqual([
      "default",
      "empty",
      "invalid",
      "timeout",
    ]);
    expect(nodeHandles({ type: "createBooking", data: defaultNodeData("createBooking") })).toEqual(["default", "error"]);
  });

  it("gera uma saída por opção do menu", () => {
    const data = { ...defaultNodeData("menu"), options: [{ label: "Agendar" }, { label: "Falar com atendente" }] };
    expect(nodeHandles({ type: "menu", data })).toEqual(["option_0", "option_1", "invalid", "timeout"]);
  });
});

describe("parseUraGraph", () => {
  it("aceita um grafo válido e completa os dados de cada nó com os padrões", () => {
    const result = parseUraGraph({
      nodes: [node("s", "start"), node("w", "waitForReply", { message: "  Qual seu nome?  ", variable: "nome" })],
      edges: [edge("e1", "s", "w")],
    });

    expect(result).toEqual({
      ok: true,
      graph: {
        nodes: [
          { id: "s", type: "start", position: at, data: { trigger: "new_conversation", keywords: [], channelIds: [] } },
          {
            id: "w",
            type: "waitForReply",
            position: at,
            data: {
              message: "Qual seu nome?",
              variable: "nome",
              validation: "none",
              errorMessage: "",
              maxRetries: 2,
              timeoutMinutes: 0,
            },
          },
        ],
        edges: [{ id: "e1", source: "s", target: "w", sourceHandle: "default" }],
      },
    });
  });

  it("normaliza o gatilho de início: palavras-chave sem vazias e só ids de canal válidos", () => {
    const result = parseUraGraph({
      nodes: [
        node("s", "start", {
          trigger: "keyword",
          keywords: ["  agendar ", "", 42, "Promo"],
          channelIds: [CHANNEL_ID, "nao-e-id"],
        }),
      ],
      edges: [],
    });

    expect(result.ok && result.graph.nodes[0].data).toEqual({
      trigger: "keyword",
      keywords: ["agendar", "Promo"],
      channelIds: [CHANNEL_ID],
    });
  });

  it("limita números aos intervalos permitidos e troca valores inválidos pelo padrão", () => {
    const result = parseUraGraph({
      nodes: [
        node("s", "start", { trigger: "qualquer" }),
        node("d1", "delay", { seconds: 0 }),
        node("d2", "delay", { seconds: 999999 }),
        node("w", "waitForReply", { maxRetries: 9, timeoutMinutes: -3, validation: "cpf", variable: "Nome Inválido" }),
      ],
      edges: [],
    });
    if (!result.ok) throw new Error(result.error);
    const [start, d1, d2, wait] = result.graph.nodes;

    expect(start.data).toMatchObject({ trigger: "new_conversation" });
    expect(d1.data).toEqual({ seconds: 1 });
    expect(d2.data).toEqual({ seconds: 86400 });
    expect(wait.data).toMatchObject({ maxRetries: 5, timeoutMinutes: 0, validation: "none", variable: "" });
  });

  it("no menu remove opções vazias, corta rótulos em 24 caracteres e mantém no máximo 10", () => {
    const options = [{ label: "  Agendar  " }, { label: "" }, { label: "Uma opção com rótulo comprido demais" }];
    for (let i = 0; i < 10; i++) options.push({ label: `Opção ${i}` });

    const result = parseUraGraph({ nodes: [node("s", "start"), node("m", "menu", { options })], edges: [] });
    if (!result.ok) throw new Error(result.error);
    const menu = result.graph.nodes[1].data as { options: { label: string }[] };

    expect(menu.options).toHaveLength(10);
    expect(menu.options[0]).toEqual({ label: "Agendar" });
    expect(menu.options[1]).toEqual({ label: "Uma opção com rótulo com" });
    expect(menu.options[9]).toEqual({ label: "Opção 7" });
  });

  it("guarda a unidade do nó de serviços só quando é um id válido", () => {
    const result = parseUraGraph({
      nodes: [node("s", "start"), node("a", "chooseService", { unitId: UNIT_ID }), node("b", "chooseService", { unitId: "x" })],
      edges: [],
    });
    if (!result.ok) throw new Error(result.error);

    expect(result.graph.nodes[1].data).toMatchObject({ unitId: UNIT_ID });
    expect(result.graph.nodes[2].data).toMatchObject({ unitId: null });
  });

  it("descarta arestas para nós que não existem, saídas que o nó não tem, laços, entradas no início e saídas repetidas", () => {
    const result = parseUraGraph({
      nodes: [
        node("s", "start"),
        node("a", "sendMessage", { text: "Oi" }),
        node("b", "sendMessage", { text: "Tchau" }),
        node("c", "condition"),
      ],
      edges: [
        edge("ok1", "s", "a"),
        edge("fantasma", "a", "zzz"),
        edge("handle-inexistente", "a", "b", "option_0"),
        edge("laco", "b", "b"),
        edge("volta-ao-inicio", "b", "s"),
        edge("ok2", "a", "b"),
        edge("repetida", "a", "c"),
        edge("ok3", "c", "a", "true"),
      ],
    });

    expect(result.ok && result.graph.edges.map((e) => e.id)).toEqual(["ok1", "ok2", "ok3"]);
  });

  it("recusa grafo sem início ou com mais de um início", () => {
    expect(parseUraGraph({ nodes: [node("a", "sendMessage")], edges: [] })).toEqual({ ok: false, error: "missing_start" });
    expect(parseUraGraph({ nodes: [node("a", "start"), node("b", "start")], edges: [] })).toEqual({
      ok: false,
      error: "multiple_start",
    });
  });

  it("recusa estrutura inválida: tipo desconhecido, id repetido, posição inválida ou listas ausentes", () => {
    const invalid = { ok: false, error: "invalid_graph" };
    expect(parseUraGraph(null)).toEqual(invalid);
    expect(parseUraGraph({ nodes: "x", edges: [] })).toEqual(invalid);
    expect(parseUraGraph({ nodes: [node("s", "start"), node("x", "foguete")], edges: [] })).toEqual(invalid);
    expect(parseUraGraph({ nodes: [node("s", "start"), node("s", "sendMessage")], edges: [] })).toEqual(invalid);
    expect(parseUraGraph({ nodes: [{ id: "s", type: "start", position: { x: "a", y: 0 }, data: {} }], edges: [] })).toEqual(
      invalid,
    );
    expect(parseUraGraph({ nodes: [node("s", "start")] })).toEqual(invalid);
  });

  it("recusa mais de 200 nós", () => {
    const nodes = [node("s", "start")];
    for (let i = 0; i < 200; i++) nodes.push(node(`n${i}`, "sendMessage"));
    expect(parseUraGraph({ nodes, edges: [] })).toEqual({ ok: false, error: "too_many_nodes" });
  });
});

describe("graphIssues", () => {
  function parsed(nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[]) {
    const result = parseUraGraph({ nodes, edges });
    if (!result.ok) throw new Error(result.error);
    return result.graph;
  }

  it("não aponta nada num fluxo completo", () => {
    const graph = parsed(
      [node("s", "start"), node("a", "sendMessage", { text: "Oi" }), node("h", "handoff")],
      [edge("e1", "s", "a"), edge("e2", "a", "h")],
    );
    expect(graphIssues(graph)).toEqual([]);
  });

  it("aponta início sem ligação, nós sem conteúdo obrigatório e nós que o início não alcança", () => {
    const graph = parsed(
      [
        node("s", "start"),
        node("msg", "sendMessage", { text: "   " }),
        node("menu", "menu", { message: "Escolha" }),
        node("media", "sendMedia"),
        node("svc", "chooseService"),
        node("go", "goTo", { targetNodeId: "nao-existe" }),
      ],
      [],
    );

    expect(graphIssues(graph)).toEqual([
      { nodeId: "s", code: "start_not_connected" },
      { nodeId: "msg", code: "empty_text" },
      { nodeId: "msg", code: "unreachable" },
      { nodeId: "menu", code: "menu_without_options" },
      { nodeId: "menu", code: "unreachable" },
      { nodeId: "media", code: "missing_media_url" },
      { nodeId: "media", code: "unreachable" },
      { nodeId: "svc", code: "missing_unit" },
      { nodeId: "svc", code: "unreachable" },
      { nodeId: "go", code: "missing_target" },
      { nodeId: "go", code: "unreachable" },
    ]);
  });

  it("considera alcançado o nó que só recebe salto de um Ir para", () => {
    const graph = parsed(
      [
        node("s", "start"),
        node("go", "goTo", { targetNodeId: "fim" }),
        node("fim", "closeConversation", { message: "Até logo" }),
      ],
      [edge("e1", "s", "go")],
    );
    expect(graphIssues(graph)).toEqual([]);
  });
});
