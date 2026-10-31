import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString } from "mongoose"
import { BanknoteIcon, ClockIcon, LeafIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import {
  parseServiceListQuery,
  SERVICE_PAGE_SIZE,
  serviceListPipeline,
  type ServiceListPage,
} from "@/service/workspace/[workspaceId]/services/service-list"
import { currencyFormat, formatDuration } from "@/components/shared/service-format"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { SortableHead } from "@/components/shared/sortable-head"
import { CreateServiceSheet, ServiceActions } from "@/components/workspace/[workspaceId]/services/service-sheets"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Service } from "@/models/Service"

export default async function UnitServicesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/services">) {
  const { workspaceId, unitId } = await params
  const query = parseServiceListQuery(await searchParams)
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { unit: "services", unitId })
  if (!isObjectIdOrHexString(unitId)) notFound()
  const canManage = can(actor, "services.manage")

  const [result] = await Service.aggregate<ServiceListPage>(serviceListPipeline(workspaceId, unitId, query))
  const pathname = `/workspace/${workspaceId}/unit/${unitId}/services`
  const listQuery = { q: query.q, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / SERVICE_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    redirect(`${pathname}?${new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Serviços</h3>
        {canManage && <CreateServiceSheet workspaceId={workspaceId} unitId={unitId} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar serviço..." />
      </div>
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Serviço" icon={LeafIcon} query={listQuery} pathname={pathname} className="w-full" />
              <SortableHead field="duration" label="Duração" icon={ClockIcon} query={listQuery} pathname={pathname} className="@max-md:hidden" />
              <SortableHead field="price" label="Preço" icon={BanknoteIcon} query={listQuery} pathname={pathname} className="text-right" />
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum serviço encontrado.
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="max-w-0 truncate px-4 font-medium">{service.name}</TableCell>
                <TableCell className="px-4 text-muted-foreground @max-md:hidden">{formatDuration(service.durationMinutes)}</TableCell>
                <TableCell className="px-4 text-right tabular-nums">{currencyFormat.format(service.priceCents / 100)}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <ServiceActions workspaceId={workspaceId} service={service} />
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
        pageSize={SERVICE_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="serviços"
      />
    </div>
  )
}
