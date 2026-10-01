"use client"

import { useReplaceQuery } from "@/components/shared/navigation-progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "all"

// Select de filtro que grava o valor escolhido na URL, preservando os demais campos da query.
export function QuerySelect<F extends string>({
  query,
  field,
  items,
  label,
}: {
  query: Record<F, string> & Record<string, string>
  field: F
  items: { value: string; label: string }[]
  label: string
}) {
  const replaceQuery = useReplaceQuery()

  return (
    <Select
      items={items}
      value={query[field] || ALL}
      onValueChange={(value) => {
        const selected = value === ALL ? "" : (value as string)
        replaceQuery({ ...query, [field]: selected })
      }}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label={label}>
        <SelectValue />
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
