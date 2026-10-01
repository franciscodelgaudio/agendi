"use client"

import { useReplaceQuery } from "@/components/shared/navigation-progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "all"

const items = [
  { value: ALL, label: "Todos os tipos" },
  { value: "appointment", label: "Atendimentos" },
  { value: "booking", label: "Agendamentos" },
  { value: "depletion", label: "Acabou" },
]

type Props = {
  // kind vazio = todos; os demais campos da query são preservados na URL.
  query: { kind: string } & Record<string, string>
}

export function ProductHistoryKindFilter({ query }: Props) {
  const replaceQuery = useReplaceQuery()

  return (
    <Select
      items={items}
      value={query.kind || ALL}
      onValueChange={(value) => {
        const kind = value === ALL ? "" : (value as string)
        replaceQuery({ ...query, kind })
      }}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por tipo">
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
