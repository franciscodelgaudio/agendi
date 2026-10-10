"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import { CalendarIcon, HomeIcon, MenuIcon, MessagesSquareIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { isNavItemActive } from "@/components/workspace/[workspaceId]/@sidebar/nav-main"
import { WORKSPACE_PAGE_PATHS, type WorkspacePage } from "@/service/workspace/[workspaceId]/page-access"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"

const tabClass =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors data-active:text-primary [&_svg]:size-5"

// Barra de abas do celular: os atalhos que a role pode ver e "Menu", que abre a sidebar com o resto.
// Altura em --bottom-nav-height (globals.css), que as páginas de tela cheia descontam.
export function MobileNav({ workspaceId, pages, actor }: { workspaceId: string; pages: WorkspacePage[]; actor: Actor }) {
  const pathname = usePathname()
  const { openMobile, setOpenMobile } = useSidebar()
  const base = `/workspace/${workspaceId}`
  const item = (page: WorkspacePage, title: string, icon: LucideIcon) =>
    pages.includes(page) ? [{ title, href: `${base}${WORKSPACE_PAGE_PATHS[page]}`, icon }] : []
  const tabs = [
    ...item("home", "Início", HomeIcon),
    ...item("calendar", "Agenda", CalendarIcon),
    ...(can(actor, "inbox.use") ? [{ title: "Conversas", href: `${base}/inbox`, icon: MessagesSquareIcon }] : []),
    ...item("cash_flow", "Caixa", WalletIcon),
  ]

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 flex h-(--bottom-nav-height) border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((tab) => {
        const active = !openMobile && isNavItemActive(pathname, tab.href, base)
        return (
          <Link
            key={tab.href}
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
