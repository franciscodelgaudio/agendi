"use client"

import { useState } from "react"
import { HashIcon } from "lucide-react"
import { cn } from "cn"
import { TableCell, TableHead } from "@/components/ui/table"
import { recordCode } from "@/lib/record-code"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Tempo que o "Copiado!" fica visível depois do clique.
const COPIED_MS = 1500

export function CodeHead({ className }: { className?: string }) {
  return (
    <TableHead className={cn("w-0 px-4", className)}>
      <span className="inline-flex items-center gap-1">
        <HashIcon className="size-4 text-muted-foreground" />
        Código
      </span>
    </TableHead>
  )
}

// Clicar copia o _id inteiro. Fica por cima de links que cobrem a linha inteira (ex.: unidades).
export function CodeCell({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <TableCell className={cn("relative z-10 px-4", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={copy}
              aria-label={`Copiar código ${id}`}
              className="cursor-copy rounded-sm font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          {recordCode(id)}
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copiado!" : "Copiar código"}</TooltipContent>
      </Tooltip>
    </TableCell>
  )
}
