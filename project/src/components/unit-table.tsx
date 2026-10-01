import Link from "@/components/link"
import { MapPinIcon, CalendarClockIcon, CalendarPlusIcon, SettingsIcon } from "lucide-react"
import { UnitActions } from "@/components/unit-actions"
import type { UnitTeamOptions } from "@/components/unit-fields"
import { CodeCell, CodeHead } from "@/components/record-code"
import { SortableHead } from "@/components/sortable-head"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UnitListQuery } from "@/lib/unit-list"
import type { BusinessHours } from "@/lib/business-hours"
import type { RevenueShare } from "@/lib/revenue-share"
import type { TreatmentRoomOption } from "@/components/treatment-room-fields"
import { dateTimeFormat } from "@/lib/utils"

type Props = {
  units: {
    id: string
    name: string
    avatarUrl: string | null
    revenueShare: RevenueShare | null
    treatmentRooms: TreatmentRoomOption[]
    businessHours: BusinessHours
    createdAt: Date
    updatedAt: Date
  }[]
  query: UnitListQuery
  pathname: string
  workspaceId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
  team: UnitTeamOptions
}

export function UnitTable({ units, query, pathname, workspaceId, canManage, team }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-2xl:hidden" />
            <SortableHead field="name" label="Nome" icon={MapPinIcon} query={query} pathname={pathname} className="w-full" />
            <SortableHead
              field="createdAt"
              label="Criado em"
              icon={CalendarPlusIcon}
              query={query}
              pathname={pathname}
              className="@max-xl:hidden"
            />
            <SortableHead
              field="updatedAt"
              label="Atualizado em"
              icon={CalendarClockIcon}
              query={query}
              pathname={pathname}
              className="@max-3xl:hidden"
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
          {units.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                Nenhuma unidade encontrada.
              </TableCell>
            </TableRow>
          ) : (
            units.map((unit) => (
              <TableRow key={unit.id} data-tour="unit-row">
                <CodeCell id={unit.id} className="@max-2xl:hidden" />
                <TableCell className="relative max-w-0 cursor-pointer px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 rounded-lg after:rounded-lg">
                      {unit.avatarUrl && (
                        <AvatarImage src={unit.avatarUrl} alt={unit.name} className="rounded-lg object-contain" />
                      )}
                      <InitialFallback name={unit.name} className="rounded-lg" />
                    </Avatar>
                    {/* O ::after estica o link sobre a célula; relative no <tr> é ignorado pelo Safari do iOS. */}
                    <Link
                      href={`${pathname}/${unit.id}`}
                      className="truncate font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {unit.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="px-4 text-muted-foreground @max-xl:hidden">{dateTimeFormat.format(unit.createdAt)}</TableCell>
                <TableCell className="px-4 text-muted-foreground @max-3xl:hidden">
                  {dateTimeFormat.format(unit.updatedAt)}
                </TableCell>
                {canManage && (
                  <TableCell className="relative z-10 px-4 text-right">
                    <UnitActions workspaceId={workspaceId} unit={unit} team={team} />
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
