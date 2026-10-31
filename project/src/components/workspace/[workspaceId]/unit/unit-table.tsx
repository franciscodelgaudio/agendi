import Link from "@/components/shared/link"
import { MapPinIcon, CalendarClockIcon, CalendarPlusIcon, SettingsIcon } from "lucide-react"
import { UnitActions } from "@/components/workspace/[workspaceId]/unit/unit-actions"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UnitListQuery } from "@/service/workspace/[workspaceId]/unit/unit-list"
import type { UnitFormOptions, UnitFormValues } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import { dateTimeFormat } from "@/service/_shared/utils"

type Props = {
  units: (UnitFormValues & { createdAt: Date; updatedAt: Date })[]
  options: UnitFormOptions
  query: UnitListQuery
  pathname: string
  workspaceId: string
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
}

export function UnitTable({ units, options, query, pathname, workspaceId, canManage }: Props) {
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
              <TableRow key={unit.id}>
                <CodeCell id={unit.id} className="@max-2xl:hidden" />
                <TableCell className="relative max-w-0 cursor-pointer px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 rounded-lg after:rounded-lg">
                      {unit.imageUrl && (
                        <AvatarImage src={unit.imageUrl} alt={unit.name} className="rounded-lg object-contain" />
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
                    <UnitActions workspaceId={workspaceId} unit={unit} options={options} />
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
