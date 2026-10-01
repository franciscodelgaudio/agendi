"use client"

import { QuerySelect } from "@/components/shared/query-select"
import { ADMIN_ROLE_NAME } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import type { RoleOption } from "@/service/workspace/[workspaceId]/team/unit-team"

const ALL = "all"

const statusItems = [
  { value: ALL, label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "pending", label: "Convite pendente" },
  { value: "expired", label: "Convite expirado" },
]

type Props = {
  // role/status vazios = todos; os demais campos da query são preservados na URL.
  query: { role: string; status: string } & Record<string, string>
}

export function UserRoleFilter({ query, roles }: Props & { roles: RoleOption[] }) {
  const roleItems = [
    { value: ALL, label: "Todas as funções" },
    { value: "admin", label: ADMIN_ROLE_NAME },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ]
  return <QuerySelect query={query} field="role" items={roleItems} label="Filtrar por função" />
}

export function UserStatusFilter({ query }: Props) {
  return <QuerySelect query={query} field="status" items={statusItems} label="Filtrar por status" />
}

