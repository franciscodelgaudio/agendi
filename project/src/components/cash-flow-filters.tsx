"use client"

import { QuerySelect } from "@/components/user-filters"

const ALL = "all"

const statusItems = [
  { value: ALL, label: "Todas" },
  { value: "paid", label: "Pagas" },
  { value: "pending", label: "Pendentes" },
]

const limitItems = [
  { value: ALL, label: "Todos os limites" },
  { value: "over", label: "Acima do limite" },
  { value: "within", label: "Dentro do limite" },
  { value: "none", label: "Sem limite" },
]

type Query<F extends string> = Record<F, string> & Record<string, string>

export function ExpenseGroupFilter({
  query,
  groups,
}: {
  query: Query<"group">
  groups: { id: string; name: string }[]
}) {
  const items = [{ value: ALL, label: "Todos os grupos" }, ...groups.map(({ id, name }) => ({ value: id, label: name }))]
  return <QuerySelect query={query} field="group" items={items} label="Filtrar por grupo" />
}

export function ExpenseStatusFilter({ query }: { query: Query<"status"> }) {
  return <QuerySelect query={query} field="status" items={statusItems} label="Filtrar por pagamento" />
}

export function GroupLimitFilter({ query }: { query: Query<"limit"> }) {
  return <QuerySelect query={query} field="limit" items={limitItems} label="Filtrar por limite" />
}
