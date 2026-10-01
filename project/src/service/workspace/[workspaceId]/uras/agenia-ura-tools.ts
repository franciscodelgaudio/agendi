import { tool } from "ai"
import { z } from "zod"
import * as ops from "@/service/workspace/[workspaceId]/uras/agenia-ura"
import type { UraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph"
import { URA_NODE_TYPES } from "@/service/workspace/[workspaceId]/uras/ura-nodes"

const newId = () => `n_${crypto.randomUUID().slice(0, 8)}`
const data = z.record(z.string(), z.any()).describe("Campos de data do nó (veja o catálogo).")

// Editam a cópia do grafo que veio do editor; onChange manda o grafo novo para o canvas.
export function buildUraTools(graph: UraGraph, onChange: (graph: UraGraph) => void) {
  const mutate = <T>(result: T) => {
    if ((result as { ok?: boolean }).ok) onChange(structuredClone(graph))
    return result
  }

  return {
    addNode: tool({
      description: "Cria um nó. connectFrom liga o nó novo a uma saída livre de um nó existente. Devolve o nodeId.",
      inputSchema: z.object({
        type: z.enum(URA_NODE_TYPES.filter((type) => type !== "start") as [string, ...string[]]),
        data: data.optional(),
        connectFrom: z
          .object({ source: z.string(), sourceHandle: z.string().optional().describe("Saída; padrão default.") })
          .optional(),
      }),
      execute: async (input) => mutate(ops.addNode(graph, input as Parameters<typeof ops.addNode>[1], newId)),
    }),
    updateNode: tool({
      description: "Altera campos de data de um nó (os outros ficam como estão).",
      inputSchema: z.object({ nodeId: z.string(), data }),
      execute: async (input) => mutate(ops.updateNode(graph, input)),
    }),
    deleteNode: tool({
      description: "Remove um nó e as conexões dele.",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async (input) => mutate(ops.deleteNode(graph, input)),
    }),
    addEdge: tool({
      description: "Liga a saída de um nó a outro nó. Se a saída já estava ligada, troca o destino.",
      inputSchema: z.object({ source: z.string(), target: z.string(), sourceHandle: z.string().optional() }),
      execute: async (input) => mutate(ops.addEdge(graph, input, newId)),
    }),
    deleteEdge: tool({
      description: "Remove a conexão de uma saída.",
      inputSchema: z.object({ source: z.string(), sourceHandle: z.string().optional() }),
      execute: async (input) => mutate(ops.deleteEdge(graph, input)),
    }),
    readNodes: tool({
      description: "Mostra os dados completos e as saídas de nós.",
      inputSchema: z.object({ nodeIds: z.array(z.string()) }),
      execute: async ({ nodeIds }) => ops.readNodes(graph, nodeIds),
    }),
    findNodes: tool({
      description: "Procura nós por tipo e/ou texto nos dados.",
      inputSchema: z.object({ type: z.string().optional(), text: z.string().optional() }),
      execute: async (input) => ops.findNodes(graph, input),
    }),
    organizeLayout: tool({
      description: "Reorganiza o canvas em camadas de cima para baixo seguindo as conexões.",
      inputSchema: z.object({}),
      execute: async () => mutate(ops.layoutGraph(graph)),
    }),
    removeUnreachable: tool({
      description: "Remove os nós que o início não alcança.",
      inputSchema: z.object({}),
      execute: async () => mutate(ops.removeUnreachable(graph)),
    }),
  }
}
