"use client"

import { usePathname } from "next/navigation"
import Link from "@/components/shared/link"
import { cn } from "@/service/_shared/utils"

export function CashFlowTabs({ base, showStatements }: { base: string; showStatements: boolean }) {
  const pathname = usePathname()
  const items = [
    { title: "Transações", href: base },
    { title: "A receber", href: `${base}/receivables` },
    ...(showStatements ? [{ title: "Fechamentos", href: `${base}/statements` }] : []),
  ]

  return (
    <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}
