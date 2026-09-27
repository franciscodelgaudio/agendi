"use client"

import Link from "@/components/link"
import { usePathname } from "next/navigation"
import { ChartColumnIcon, FolderIcon, ReceiptIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { path: "", title: "Resumo", icon: ChartColumnIcon },
  { path: "/expenses", title: "Despesas", icon: ReceiptIcon },
  { path: "/groups", title: "Grupos", icon: FolderIcon },
]

// Abas do caixa, abaixo das abas da unidade.
export function CashFlowSubNav({ base }: { base: string }) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const href = `${base}${tab.path}`
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors [&_svg]:size-4",
              isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon />
            {tab.title}
          </Link>
        )
      })}
    </nav>
  )
}
