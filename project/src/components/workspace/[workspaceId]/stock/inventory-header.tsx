import { BoxesIcon, ChevronLeftIcon, HistoryIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { SectionNav } from "@/components/shared/section-nav"
import { Button } from "@/components/ui/button"

export function InventoryHeader({
  workspaceId,
  inventory,
  children,
}: {
  workspaceId: string
  inventory: { id: string; name: string }
  children?: React.ReactNode
}) {
  const base = `/workspace/${workspaceId}/stock/${inventory.id}`
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label="Voltar aos inventários"
            render={<Link href={`/workspace/${workspaceId}/stock`} />}
          >
            <ChevronLeftIcon />
          </Button>
          <h3 className="truncate text-lg font-semibold tracking-tight">{inventory.name}</h3>
        </div>
        <div className="flex gap-2">{children}</div>
      </div>
      <SectionNav
        items={[
          { title: "Produtos", icon: <BoxesIcon />, href: base },
          { title: "Movimentos", icon: <HistoryIcon />, href: `${base}/movements` },
        ]}
      />
    </>
  )
}
