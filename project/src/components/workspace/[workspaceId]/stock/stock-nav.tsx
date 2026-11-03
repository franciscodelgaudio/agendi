"use client"

import { BoxesIcon, HistoryIcon, PackageIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { SectionNav, type SectionNavItem } from "@/components/shared/section-nav"

export function StockNav({ workspaceId, unit }: { workspaceId: string; unit: { inventoryId: string | null } | null }) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}/stock`
  if (unit && !unit.inventoryId) return null

  const items: SectionNavItem[] = unit?.inventoryId
    ? [
        { title: "Em estoque", icon: <BoxesIcon />, href: `${base}/${unit.inventoryId}` },
        { title: "Movimentações", icon: <HistoryIcon />, href: `${base}/${unit.inventoryId}/movements` },
      ]
    : [
        { title: "Estoques", icon: <BoxesIcon />, href: base },
        { title: "Produtos", icon: <PackageIcon />, href: `${base}/products` },
      ]

  if (!items.some((item) => item.href === pathname)) return null
  return <SectionNav items={items} />
}
