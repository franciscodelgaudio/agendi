"use client"

import { createContext, memo, useContext, useEffect } from "react"
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react"
import { TriangleAlertIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"
import { nodeHandles, type UraNode } from "@/service/workspace/[workspaceId]/uras/ura-graph"
import type { UraNodeType } from "@/service/workspace/[workspaceId]/uras/ura-nodes"
import { categoryMeta, handleLabel, nodeMeta, nodeSummary } from "@/components/workspace/[workspaceId]/uras/[uraId]/ura-node-meta"

export type FlowNodeData = { kind: UraNodeType; config: UraNode["data"] }
export type FlowNode = Node<FlowNodeData, "ura">

// Avisos por nó e título dos nós (para o resumo do "Ir para"), vindos do editor.
export const FlowNodeContext = createContext<{ issues: Map<string, number>; nodeTitle: (id: string) => string | null }>({
  issues: new Map(),
  nodeTitle: () => null,
})

const handleClass = "!size-3 !border-2 !border-background !bg-muted-foreground"

export const UraFlowNode = memo(function UraFlowNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { issues, nodeTitle } = useContext(FlowNodeContext)
  const node = { id, type: data.kind, data: data.config, position: { x: 0, y: 0 } } as UraNode
  const meta = nodeMeta[data.kind]
  const Icon = meta.icon
  const handles = nodeHandles(node)
  const summary = nodeSummary(node, nodeTitle)
  const single = handles.length === 1 && handleLabel(node, handles[0]) === ""
  const updateNodeInternals = useUpdateNodeInternals()
  const handlesKey = handles.join("|")

  // As saídas do menu mudam com as opções; o React Flow precisa remedir o nó.
  useEffect(() => updateNodeInternals(id), [id, handlesKey, updateNodeInternals])

  return (
    <div
      className={cn(
        "relative w-60 rounded-md border bg-card text-card-foreground shadow-sm",
        selected && "ring-2 ring-primary",
        issues.has(id) && !selected && "border-amber-500",
      )}
    >
      {data.kind !== "start" && <Handle type="target" position={Position.Left} className={handleClass} />}
      <div className={cn("flex items-center gap-2 rounded-t-[5px] px-3 py-1.5 text-xs font-medium", categoryMeta[meta.category].className)}>
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{meta.label}</span>
        {issues.has(id) && <TriangleAlertIcon className="ml-auto size-3.5 shrink-0" aria-label="Revisar" />}
      </div>
      {summary && <p className="line-clamp-2 px-3 py-2 text-xs break-words text-muted-foreground">{summary}</p>}
      {single ? (
        <Handle type="source" position={Position.Right} id={handles[0]} className={handleClass} />
      ) : (
        handles.length > 0 && (
          <ul className="border-t py-1">
            {handles.map((handle) => (
              <li key={handle} className="relative truncate py-1 pr-4 pl-3 text-right text-xs">
                {handleLabel(node, handle) || "—"}
                <Handle type="source" position={Position.Right} id={handle} className={handleClass} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
})
