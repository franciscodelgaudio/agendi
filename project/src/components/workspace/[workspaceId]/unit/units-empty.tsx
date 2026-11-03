import { MapPinIcon, PlusIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function NewUnitButton({ workspaceId }: { workspaceId: string }) {
  return (
    <Button nativeButton={false} render={<Link href={`/workspace/${workspaceId}/unit/new`} />}>
      <PlusIcon />
      Nova unidade
    </Button>
  )
}

type Props = { workspaceId: string; canManage: boolean }

export function UnitsEmpty({ workspaceId, canManage }: Props) {
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
          <NewUnitButton workspaceId={workspaceId} />
        </EmptyContent>
      )}
    </Empty>
  )
}
