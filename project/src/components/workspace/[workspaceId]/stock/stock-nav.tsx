"use client"

import { BoxesIcon, PackageIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { SectionNav } from "@/components/shared/section-nav"

export function StockNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}/stock`
  const products = `${base}/products`
  if (pathname !== base && pathname !== products) return null

  return (
    <SectionNav
      items={[
        { title: "Inventários", icon: BoxesIcon, href: base },
        { title: "Produtos", icon: PackageIcon, href: products },
      ]}
    />
  )
}
