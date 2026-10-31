"use client"

import { QuerySelect } from "@/components/shared/query-select"
import type { RoleOption } from "@/components/workspace/[workspaceId]/users/member-fields"

const ALL = "all"

type Props = {
  query: { role: string } & Record<string, string>
  roles: RoleOption[]
}

export function UserRoleFilter({ query, roles }: Props) {
  const roleItems = [
    { value: ALL, label: "Todas as funções" },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ]
  return <QuerySelect query={query} field="role" items={roleItems} label="Filtrar por função" />
}
