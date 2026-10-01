"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import { CalendarIcon, ListIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/service/_shared/utils"

type NavItem = { title: string; href: string; icon: LucideIcon }

// Alterna entre o calendário e a lista de agendamentos; base é a rota do calendário.
export function CalendarNav({ base }: { base: string }) {
  const pathname = usePathname()
  const items: NavItem[] = [
    { title: "Agenda", href: base, icon: CalendarIcon },
    { title: "Lista", href: `${base}/list`, icon: ListIcon },
  ]

  return (
    <nav className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-colors [&_svg]:size-4",
              isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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
