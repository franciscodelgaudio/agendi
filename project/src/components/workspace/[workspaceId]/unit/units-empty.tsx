import { MapPinIcon } from "lucide-react"
import { CreateUnitSheet } from "@/components/workspace/[workspaceId]/unit/create-unit-sheet"
import type { UnitTeamOptions } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type Props = { workspaceId: string; canManage: boolean; team: UnitTeamOptions }

export function UnitsEmpty({ workspaceId, canManage, team }: Props) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MapPinIcon />
        </EmptyMedia>
        <EmptyTitle>Nenhuma unidade cadastrada</EmptyTitle>
        <EmptyDescription>
          {canManage
            ? "Este workspace ainda não tem unidades. Cadastre a primeira para começar."
            : "Este workspace ainda não tem unidades."}
        </EmptyDescription>
      </EmptyHeader>
      {canManage && (
        <EmptyContent>
          <CreateUnitSheet workspaceId={workspaceId} team={team} />
        </EmptyContent>
      )}
    </Empty>
  )
}
