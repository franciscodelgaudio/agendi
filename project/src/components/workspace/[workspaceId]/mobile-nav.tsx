"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import { CalendarIcon, HomeIcon, MenuIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { canSee } from "@/components/workspace/[workspaceId]/@sidebar/nav-main"
import type { RolePages } from "@/service/workspace/[workspaceId]/page-access"
import { sectionHref, sectionOf, unitFromPath, type NavSection } from "@/service/workspace/[workspaceId]/unit-context"

const tabClass =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors data-active:text-primary [&_svg]:size-5"

const TABS: { section: NavSection; title: string; icon: LucideIcon }[] = [
  { section: "inicio", title: "Início", icon: HomeIcon },
  { section: "agenda", title: "Agenda", icon: CalendarIcon },
  { section: "caixa", title: "Caixa", icon: WalletIcon },
]

export function MobileNav({ workspaceId, pages }: { workspaceId: string; pages: RolePages }) {
  const pathname = usePathname()
  const { openMobile, setOpenMobile } = useSidebar()
  const base = `/workspace/${workspaceId}`
  const unitId = unitFromPath(pathname, base)
  const unit = unitId ? { id: unitId, inventoryId: null } : null
  const current = sectionOf(pathname, base)
  const tabs = TABS.flatMap((tab) => {
    const href = canSee(tab.section, pages, !!unit) && sectionHref(tab.section, base, unit)
    return href ? [{ ...tab, href }] : []
  })

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 flex h-(--bottom-nav-height) border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((tab) => {
        const active = !openMobile && current === tab.section
        return (
          <Link
            key={tab.section}
            href={tab.href}
            data-active={active || undefined}
            aria-current={active ? "page" : undefined}
            className={tabClass}
          >
            <tab.icon />
            <span className="max-w-full truncate">{tab.title}</span>
          </Link>
        )
      })}
      <button
        type="button"
        data-active={openMobile || undefined}
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(!openMobile)}
        className={tabClass}
      >
        <MenuIcon />
        <span>Menu</span>
      </button>
    </nav>
  )
}
