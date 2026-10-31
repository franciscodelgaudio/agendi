import { redirect } from "next/navigation"
import { CalendarIcon, ContactIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import {
  CUSTOMER_LIST_COLLATION,
  CUSTOMER_PAGE_SIZE,
  customerListPipeline,
  parseCustomerListQuery,
  type CustomerListPage,
} from "@/service/workspace/[workspaceId]/customers/customer-list"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { SortableHead } from "@/components/shared/sortable-head"
import { CreateCustomerSheet, CustomerActions } from "@/components/workspace/[workspaceId]/customers/customer-sheets"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Customer } from "@/models/Customer"

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })

function formatCellphone(digits: string) {
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(digits.slice(-11))
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : digits
}

export default async function CustomersPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/customers">) {
  const { workspaceId } = await params
  const query = parseCustomerListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "customers" })
  const canManage = can(actor, "customers.manage")

  const [result] = await Customer.aggregate<CustomerListPage>(customerListPipeline(workspaceId, query), {
    collation: CUSTOMER_LIST_COLLATION,
  })
  const pathname = `/workspace/${workspaceId}/customers`
  const listQuery = { q: query.q, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / CUSTOMER_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Clientes</h2>
        {canManage && <CreateCustomerSheet workspaceId={workspaceId} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar por nome ou celular..." />
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Cliente" icon={ContactIcon} query={listQuery} pathname={pathname} className="w-full" />
              <TableHead className="px-4 @max-md:hidden">Celular</TableHead>
              <SortableHead
                field="createdAt"
                label="Cadastro"
                icon={CalendarIcon}
                query={listQuery}
                pathname={pathname}
                className="@max-xl:hidden"
              />
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="max-w-0 px-4">
                  <div className="truncate font-medium">{customer.name}</div>
                  {customer.observation && (
                    <div className="truncate text-sm text-muted-foreground">{customer.observation}</div>
                  )}
                </TableCell>
                <TableCell className="px-4 tabular-nums @max-md:hidden">
                  {customer.cellphone ? formatCellphone(customer.cellphone) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="px-4 tabular-nums @max-xl:hidden">{dateFormat.format(customer.createdAt)}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <CustomerActions workspaceId={workspaceId} customer={customer} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={CUSTOMER_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="clientes"
      />
    </div>
  )
}
