import { BoxesIcon, ChevronLeftIcon, HistoryIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { SectionNav } from "@/components/shared/section-nav"
import { Button } from "@/components/ui/button"

export function InventoryHeader({
  workspaceId,
  inventory,
  ofSelectedUnit,
}: {
  workspaceId: string
  inventory: { id: string; name: string }
  ofSelectedUnit: boolean
}) {
  const base = `/workspace/${workspaceId}/stock/${inventory.id}`

  if (ofSelectedUnit) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <BoxesIcon className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="truncate text-lg font-semibold tracking-tight">{inventory.name}</h3>
      </div>
    )
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          aria-label="Voltar aos estoques"
          render={<Link href={`/workspace/${workspaceId}/stock`} />}
        >
          <ChevronLeftIcon />
        </Button>
        <h3 className="truncate text-lg font-semibold tracking-tight">{inventory.name}</h3>
      </div>
      <SectionNav
        items={[
          { title: "Em estoque", icon: <BoxesIcon />, href: base },
          { title: "Movimentações", icon: <HistoryIcon />, href: `${base}/movements` },
        ]}
      />
    </>
  )
}
