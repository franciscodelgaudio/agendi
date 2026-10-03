import { ClockIcon, BanknoteIcon, SettingsIcon, LeafIcon } from "lucide-react"
import { ServiceActions } from "@/components/workspace/[workspaceId]/unit/[unitId]/services/service-actions"
import type { ServiceFieldValues, ServiceRoomOption } from "@/components/workspace/[workspaceId]/unit/[unitId]/services/service-fields"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ServiceListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service-list"
import { currencyFormat, formatDuration } from "@/components/shared/service-format"

type Props = {
  services: (ServiceFieldValues & { id: string })[]
  treatmentRooms: ServiceRoomOption[]
  query: ServiceListQuery
  pathname: string
  workspaceId: string
  unitId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
}

export function ServiceTable({ services, treatmentRooms, query, pathname, workspaceId, unitId, canManage }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-xl:hidden" />
            <SortableHead field="name" label="Serviço" icon={LeafIcon} query={query} pathname={pathname} className="w-full" />
            <SortableHead field="priceCents" label="Valor" icon={BanknoteIcon} query={query} pathname={pathname} />
            <SortableHead
              field="durationMinutes"
              label="Duração média"
              icon={ClockIcon}
              query={query}
              pathname={pathname}
              className="@max-md:hidden"
            />
            {canManage && (
              <TableHead className="w-0 px-4 text-right">
                <span className="inline-flex items-center gap-1">
                  <SettingsIcon className="size-4 text-muted-foreground" />
                  Ações
                </span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum serviço encontrado.
              </TableCell>
            </TableRow>
          ) : (
            services.map((service) => (
              <TableRow key={service.id} data-tour="service-row">
                <CodeCell id={service.id} className="@max-xl:hidden" />
                <TableCell className="max-w-0 truncate px-4 font-medium">{service.name}</TableCell>
                <TableCell className="px-4 tabular-nums">{currencyFormat.format(service.priceCents / 100)}</TableCell>
                <TableCell className="px-4 text-muted-foreground @max-md:hidden">{formatDuration(service.durationMinutes)}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <ServiceActions workspaceId={workspaceId} unitId={unitId} service={service} treatmentRooms={treatmentRooms} />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
