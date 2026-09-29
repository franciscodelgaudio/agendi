"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import type { AgeniaModelOption } from "@/lib/agenia-models"
import { updateAgeniaModelAction } from "@/lib/actions/workspace"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

export function AgeniaModelSelect({ workspaceId, models, value }: { workspaceId: string; models: AgeniaModelOption[]; value: string | null }) {
  const [current, setCurrent] = useState(value)
  const [pending, startTransition] = useTransition()
  const items = models.map((m) => ({ value: m.id, label: m.label }))

  if (!models.length) return <span className="text-sm text-muted-foreground">Nenhum provedor de IA configurado</span>

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(next) => {
        if (!next || next === current) return
        const previous = current
        setCurrent(String(next))
        startTransition(async () => {
          const { error } = await updateAgeniaModelAction(workspaceId, String(next))
          if (error) {
            setCurrent(previous)
            toast.error(error)
          }
        })
      }}
    >
      <SelectTrigger className="w-full sm:w-60" aria-label="Modelo da AgenIA" disabled={pending}>
        <span className="text-muted-foreground">Modelo</span>
        <SelectValue />
        {pending && <Spinner className="size-3.5" />}
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
