import { notFound } from "next/navigation"
import { listarClientes } from "@/contextos/clientes/consultas"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { first } from "@/service/workspace/[workspaceId]/unit/unit-list"
import { Workspace } from "@/models/Workspace"
import { CreateCustomerSheet } from "@/components/workspace/[workspaceId]/customers/create-customer-sheet"
import { CustomerTable } from "@/components/workspace/[workspaceId]/customers/customer-table"
import { CustomersEmpty } from "@/components/workspace/[workspaceId]/customers/customers-empty"
import { ListSearch } from "@/components/shared/list-search"

// Clientes recorrentes do workspace, buscados pelo nome ou pelo começo do CPF.
export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/customers">) {
  const { workspaceId } = await params
  const q = first((await searchParams).q)?.trim() ?? ""
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "customers" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ id: string; actor: Actor }>([
    ...access,
    { $project: { _id: 0, id: { $toString: "$_id" }, actor: 1 } },
  ])
  if (!workspace) notFound()
  const canManage = can(workspace.actor, "bookings.manage")

  const customers = await listarClientes(workspace.id, q)
  // Busca sem resultado: confere se há algum cliente para separar "nenhum cadastrado" de
  // "nenhum encontrado".
  const hasCustomers = customers.length > 0 || (q !== "" && (await listarClientes(workspace.id)).length > 0)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Clientes</h2>
        {canManage && hasCustomers && <CreateCustomerSheet workspaceId={workspaceId} />}
      </div>
      {hasCustomers ? (
        <>
          <ListSearch query={{ q }} placeholder="Buscar nome ou CPF..." />
          <CustomerTable customers={customers} workspaceId={workspaceId} canManage={canManage} />
        </>
      ) : (
        <CustomersEmpty workspaceId={workspaceId} canManage={canManage} />
      )}
    </div>
  )
}
