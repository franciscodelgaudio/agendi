"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import { PackageIcon, ArchiveIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"

// Abas da página de estoque: quantidades por estoque e o catálogo de produtos.
export function StockNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}/stock`
  const items = [
    { title: "Estoque", icon: ArchiveIcon, href: base },
    { title: "Produtos", icon: PackageIcon, href: `${base}/products` },
  ]

  return (
    <nav className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto bg-background px-4 pt-2 overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 pt-2 pb-4 text-sm font-medium transition-colors [&_svg]:size-4",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon />
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}
