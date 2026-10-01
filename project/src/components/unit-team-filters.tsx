import type { RoleOption } from "@/lib/unit-team"
import { QuerySelect } from "@/components/user-filters"

const ALL = "all"

const statusItems = [
  { value: ALL, label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "pending", label: "Convite pendente" },
]

const payItems = [
  { value: ALL, label: "Toda remuneração" },
  { value: "commission", label: "Comissão" },
  { value: "salary", label: "Salário" },
  { value: "none", label: "Não definida" },
]

type Props = {
  // role/status/pay vazios = todos; os demais campos da query são preservados na URL.
  query: { role: string; status: string; pay: string } & Record<string, string>
  // Roles do workspace; administradores não fazem parte da equipe das unidades.
  roles: RoleOption[]
}

export function UnitTeamFilters({ query, roles }: Props) {
  const roleItems = [{ value: ALL, label: "Todas as funções" }, ...roles.map((role) => ({ value: role.id, label: role.name }))]
  return (
    <>
      <QuerySelect query={query} field="role" items={roleItems} label="Filtrar por função" />
      <QuerySelect query={query} field="status" items={statusItems} label="Filtrar por status" />
      <QuerySelect query={query} field="pay" items={payItems} label="Filtrar por remuneração" />
    </>
  )
}
