"use client"

import "@xyflow/react/dist/style.css"

import { useCallback, useMemo, useRef, useState, useTransition } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react"
import { toast } from "sonner"
import { ArrowLeftIcon, PauseIcon, PlayIcon, SaveIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon, Undo2Icon, XIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { cn } from "@/service/_shared/utils"
import { saveUraAction, setUraActiveAction } from "@/lib/actions/ura"
import { graphIssues, nodeHandles, type UraEdge, type UraGraph, type UraNode } from "@/service/workspace/[workspaceId]/uras/ura-graph"
import { MAX_URA_NAME_LENGTH } from "@/service/workspace/[workspaceId]/uras/ura"
import { defaultNodeData, type UraNodeType } from "@/service/workspace/[workspaceId]/uras/ura-nodes"
import { UraNodeConfig, type ConfigContext } from "@/components/workspace/[workspaceId]/uras/[uraId]/ura-node-config"
import { FlowNodeContext, UraFlowNode, type FlowNode } from "@/components/workspace/[workspaceId]/uras/[uraId]/ura-flow-node"
import { availableVariables, categoryMeta, issueLabels, nodeMeta, PALETTE } from "@/components/workspace/[workspaceId]/uras/[uraId]/ura-node-meta"
import { AgeniaChat } from "@/components/workspace/[workspaceId]/agenia/agenia-chat"
import { useAgeniaSession, type AgeniaDataPart } from "@/components/workspace/[workspaceId]/agenia/use-agenia-session"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Props = {
  workspaceId: string
  ura: { id: string; name: string; active: boolean } & UraGraph
  channels: ConfigContext["channels"]
  units: ConfigContext["units"]
  users: ConfigContext["users"]
}

const nodeTypes = { ura: UraFlowNode }

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`

const toFlowNode = (node: UraNode): FlowNode => ({
  id: node.id,
  type: "ura",
  position: node.position,
  data: { kind: node.type, config: node.data },
  deletable: node.type !== "start",
})

const toFlowEdge = (edge: UraEdge): Edge => ({ ...edge, animated: false })

const toUraNode = (node: FlowNode) =>
  ({ id: node.id, type: node.data.kind, position: node.position, data: node.data.config }) as UraNode

// Grafo para salvar. Opções de menu vazias saem, e as arestas das opções seguintes
// acompanham o novo índice (senão ligariam à opção errada).
function toGraph(nodes: FlowNode[], edges: Edge[]): UraGraph {
  const remap = new Map<string, Map<string, string | null>>()
  const uraNodes = nodes.map((flowNode) => {
    const node = toUraNode(flowNode)
    if (node.type !== "menu") return node
    const handles = new Map<string, string | null>()
    let next = 0
    const options = node.data.options.filter((option, i) => {
      const kept = option.label.trim() !== ""
      handles.set(`option_${i}`, kept ? `option_${next++}` : null)
      return kept
    })
    remap.set(node.id, handles)
    return { ...node, data: { ...node.data, options } }
  })
  const uraEdges = edges.flatMap((edge) => {
    const handle = edge.sourceHandle ?? "default"
    const mapped = remap.get(edge.source)?.has(handle) ? remap.get(edge.source)!.get(handle) : handle
    return mapped ? [{ id: edge.id, source: edge.source, target: edge.target, sourceHandle: mapped }] : []
  })
  return { nodes: uraNodes, edges: uraEdges }
}

const snapshot = (name: string, graph: UraGraph) => JSON.stringify({ name, graph })

export function UraEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ workspaceId, ura, channels, units, users }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(ura.nodes.map(toFlowNode))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(ura.edges.map(toFlowEdge))
  const [name, setName] = useState(ura.name)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => snapshot(ura.name, { nodes: ura.nodes, edges: ura.edges }))
  const [saving, startSaving] = useTransition()
  const [toggling, startToggling] = useTransition()
  const canvas = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter, fitView } = useReactFlow()
  const [ageniaOpen, setAgeniaOpen] = useState(false)
  // Estado do canvas antes de cada pedido à AgenIA, para desfazer o que ela mudou.
  const [checkpoints, setCheckpoints] = useState<{ nodes: FlowNode[]; edges: Edge[] }[]>([])

  // A AgenIA edita uma cópia do grafo no servidor e manda o resultado a cada mudança.
  const agenia = useAgeniaSession({
    workspaceId,
    mode: "ura",
    scopeId: ura.id,
    body: () => ({
      ura: {
        id: ura.id,
        name,
        active: ura.active,
        graph: toGraph(nodes, edges),
        selectedNodeId: selectedId,
      },
    }),
    onData: (part: AgeniaDataPart) => {
      if (part.type !== "data-ura-graph") return
      const graph = part.data as UraGraph
      setNodes(graph.nodes.map(toFlowNode))
      setEdges(graph.edges.map(toFlowEdge))
      setSelectedId(null)
      setTimeout(() => void fitView({ duration: 300, maxZoom: 1 }), 50)
    },
  })

  function undoAgenia() {
    const last = checkpoints.at(-1)
    if (!last) return
    setNodes(last.nodes)
    setEdges(last.edges)
    setSelectedId(null)
    setCheckpoints((current) => current.slice(0, -1))
  }

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges])
  const dirty = snapshot(name, graph) !== saved
  const issues = useMemo(() => graphIssues(graph), [graph])
  const uraNodes = useMemo(() => nodes.map(toUraNode), [nodes])
  const nodeContext = useMemo(() => {
    const counts = new Map<string, number>()
    for (const issue of issues) counts.set(issue.nodeId, (counts.get(issue.nodeId) ?? 0) + 1)
    const byId = new Map(uraNodes.map((node) => [node.id, node]))
    return {
      issues: counts,
      nodeTitle: (id: string) => {
        const node = byId.get(id)
        return node ? `→ ${nodeMeta[node.type].label}` : null
      },
    }
  }, [issues, uraNodes])
  const configContext: ConfigContext = useMemo(
    () => ({ workspaceId, channels, units, users, nodes: uraNodes, variables: availableVariables(uraNodes) }),
    [workspaceId, channels, units, users, uraNodes],
  )
  const selected = uraNodes.find((node) => node.id === selectedId) ?? null

  // Uma aresta por saída: ligar de novo a mesma saída troca o destino.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return
      const handle = connection.sourceHandle ?? "default"
      setEdges((current) => [
        ...current.filter((e) => !(e.source === connection.source && (e.sourceHandle ?? "default") === handle)),
        { id: newId("e"), source: connection.source, target: connection.target, sourceHandle: handle },
      ])
    },
    [setEdges],
  )

  function addNode(type: UraNodeType) {
    const rect = canvas.current?.getBoundingClientRect()
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 }
    const position = screenToFlowPosition(center)
    // Deslocamento aleatório pequeno para nós seguidos não ficarem empilhados.
    const jitter = () => Math.round((Math.random() - 0.5) * 60)
    const node = toFlowNode({
      id: newId("n"),
      type,
      position: { x: position.x - 120 + jitter(), y: position.y - 40 + jitter() },
      data: defaultNodeData(type),
    } as UraNode)
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), { ...node, selected: true }])
    setSelectedId(node.id)
  }

  function updateConfig(id: string, config: UraNode["data"]) {
    setNodes((current) => current.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)))
    const node = uraNodes.find((n) => n.id === id)
    if (!node) return
    // Saída que deixou de existir (opção removida) perde a aresta.
    const handles = nodeHandles({ type: node.type, data: config } as UraNode)
    setEdges((current) => current.filter((e) => e.source !== id || handles.includes(e.sourceHandle ?? "default")))
  }

  function removeNode(id: string) {
    setNodes((current) => current.filter((n) => n.id !== id))
    setEdges((current) => current.filter((e) => e.source !== id && e.target !== id))
    setSelectedId(null)
  }

  function focusNode(id: string) {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    setNodes((current) => current.map((n) => ({ ...n, selected: n.id === id })))
    setSelectedId(id)
    void setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 300 })
  }

  function save() {
    startSaving(async () => {
      const result = await saveUraAction(workspaceId, ura.id, { name, graph })
      if (result.error) return void toast.error(result.error)
      setSaved(snapshot(name, graph))
      toast.success("URA salva.")
    })
  }

  function toggleActive() {
    startToggling(async () => {
      const result = await setUraActiveAction(workspaceId, ura.id, !ura.active)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon-sm" aria-label="Voltar para as URAs" nativeButton={false} render={<Link href={`/workspace/${workspaceId}/uras`} />}>
          <ArrowLeftIcon />
        </Button>
        <Input
          aria-label="Nome da URA"
          value={name}
          maxLength={MAX_URA_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          className="h-8 max-w-72 font-medium"
        />
        <Badge variant={ura.active ? "default" : "secondary"}>{ura.active ? "Ativa" : "Inativa"}</Badge>
        {dirty && <span className="hidden text-xs text-muted-foreground sm:inline">Alterações não salvas</span>}
        <div className="ml-auto flex items-center gap-2">
          {issues.length > 0 && (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                <TriangleAlertIcon className="text-amber-600" />
                {issues.length}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-1">
                <ul className="max-h-80 overflow-y-auto">
                  {issues.map((issue, i) => {
                    const node = uraNodes.find((n) => n.id === issue.nodeId)
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => focusNode(issue.nodeId)}
                        >
                          <span className="text-xs text-muted-foreground">{node ? nodeMeta[node.type].label : ""}</span>
                          {issueLabels[issue.code]}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          )}
          <Button variant={ageniaOpen ? "secondary" : "outline"} size="sm" onClick={() => setAgeniaOpen((open) => !open)}>
            <SparklesIcon />
            AgenIA
          </Button>
          <Button variant="outline" size="sm" loading={toggling} onClick={toggleActive}>
            {ura.active ? <PauseIcon /> : <PlayIcon />}
            {ura.active ? "Desativar" : "Ativar"}
          </Button>
          <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
            <SaveIcon />
            Salvar
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 overflow-x-hidden overflow-y-auto border-r p-2 md:flex">
          {PALETTE.map((category) => (
            <div key={category} className="grid min-w-0 gap-0.5">
              <span className="px-1 text-xs font-medium text-muted-foreground">{categoryMeta[category].label}</span>
              {(Object.keys(nodeMeta) as UraNodeType[])
                .filter((type) => nodeMeta[type].category === category)
                .map((type) => {
                  const Icon = nodeMeta[type].icon
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addNode(type)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", categoryMeta[category].className)}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="truncate">{nodeMeta[type].label}</span>
                    </button>
                  )
                })}
            </div>
          ))}
        </aside>

        <div ref={canvas} className="relative min-w-0 flex-1">
          <FlowNodeContext value={nodeContext}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={(deleted) => deleted.some((n) => n.id === selectedId) && setSelectedId(null)}
              onSelectionChange={({ nodes: picked }) => setSelectedId(picked.length === 1 ? picked[0].id : null)}
              isValidConnection={(connection) => connection.source !== connection.target}
              defaultEdgeOptions={{ type: "smoothstep" }}
              snapToGrid
              snapGrid={[15, 15]}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={15} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="max-lg:hidden" />
            </ReactFlow>
          </FlowNodeContext>
        </div>

        {selected && (
          <aside className="absolute inset-y-0 right-0 z-10 flex w-80 max-w-full flex-col border-l bg-background md:static md:z-auto">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
              <span className="truncate text-sm font-medium">{nodeMeta[selected.type].label}</span>
              {selected.type !== "start" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Excluir nó"
                  onClick={() => removeNode(selected.id)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {issues
                .filter((issue) => issue.nodeId === selected.id)
                .map((issue) => (
                  <p key={issue.code} className="mb-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlertIcon className="size-3.5 shrink-0" />
                    {issueLabels[issue.code]}
                  </p>
                ))}
              <UraNodeConfig key={selected.id} node={selected} ctx={configContext} onChange={(config) => updateConfig(selected.id, config)} />
            </div>
          </aside>
        )}

        {ageniaOpen && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-96 max-w-full flex-col border-l bg-background md:static md:z-auto">
            <AgeniaChat
              session={agenia}
              title="AgenIA · URA"
              suggestions={["Monte um fluxo de boas-vindas com menu de agendamento", "Revise este fluxo e corrija os avisos", "Organize o fluxo"]}
              onBeforeSend={() => setCheckpoints((current) => [...current, structuredClone({ nodes, edges })])}
              actions={
                <>
                  {checkpoints.length > 0 && (
                    <Button variant="ghost" size="icon-sm" aria-label="Desfazer o último pedido" onClick={undoAgenia}>
                      <Undo2Icon />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Fechar AgenIA" onClick={() => setAgeniaOpen(false)}>
                    <XIcon />
                  </Button>
                </>
              }
            />
          </aside>
        )}
      </div>
    </div>
  )
}
