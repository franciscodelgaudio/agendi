import { MapPinIcon } from "lucide-react"
import { CreateUnitSheet } from "@/components/workspace/[workspaceId]/unit/create-unit-sheet"
import type { MemberOption } from "@/components/workspace/[workspaceId]/unit/unit-member-fields"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type Props = { workspaceId: string; canManage: boolean; members: MemberOption[] }

export function UnitsEmpty({ workspaceId, canManage, members }: Props) {
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
          <CreateUnitSheet workspaceId={workspaceId} members={members} />
        </EmptyContent>
      )}
    </Empty>
  )
}
