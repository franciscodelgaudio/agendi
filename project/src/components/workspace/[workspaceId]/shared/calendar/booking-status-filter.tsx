"use client"

import { useReplaceQuery } from "@/components/shared/navigation-progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "all"

const items = [
  { value: ALL, label: "Todos os status" },
  { value: "scheduled", label: "Agendados" },
  { value: "done", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
]

type Props = {
  query: { status: string } & Record<string, string>
}

export function BookingStatusFilter({ query }: Props) {
  const replaceQuery = useReplaceQuery()

  return (
    <Select
      items={items}
      value={query.status || ALL}
      onValueChange={(value) => {
        const status = value === ALL ? "" : (value as string)
        replaceQuery({ ...query, status })
      }}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por status">
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
