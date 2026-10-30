"use client"

import { QuerySelect } from "@/components/shared/query-select"
import type { RoleOption } from "@/components/workspace/[workspaceId]/users/member-fields"

const ALL = "all"

const statusItems = [
  { value: ALL, label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "pending", label: "Convite pendente" },
  { value: "expired", label: "Convite expirado" },
]

type Props = {
  query: { role: string; status: string } & Record<string, string>
}

export function UserRoleFilter({ query, roles }: Props & { roles: RoleOption[] }) {
  const roleItems = [
    { value: ALL, label: "Todas as funções" },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ]
  return <QuerySelect query={query} field="role" items={roleItems} label="Filtrar por função" />
}

export function UserStatusFilter({ query }: Props) {
  return <QuerySelect query={query} field="status" items={statusItems} label="Filtrar por status" />
}
