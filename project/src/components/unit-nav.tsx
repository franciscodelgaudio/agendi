"use client"

import Link from "@/components/link"
import { usePathname } from "next/navigation"
import { ArrowRightIcon, CalendarIcon, CircleCheckIcon, LayoutDashboardIcon, LeafIcon, PackageIcon, UsersIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UNIT_PAGE_PATHS, type UnitPage } from "@/lib/page-access"
import { cn } from "@/lib/utils"

type NavItem = { title: string; icon: LucideIcon; pending?: boolean }

// hasServices: sem serviços a unidade não agenda nem registra atendimentos, então a aba
// Serviços ganha um indicador até o primeiro cadastro. pages: abas liberadas para a função do usuário.
export function UnitNav({
  workspaceId,
  unitId,
  hasServices,
  pages,
}: {
  workspaceId: string
  unitId: string
  hasServices: boolean
  pages: UnitPage[]
}) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}/unit/${unitId}`
  const tabs: Record<UnitPage, NavItem> = {
    overview: { title: "Visão geral", icon: LayoutDashboardIcon },
    services: { title: "Serviços", icon: LeafIcon, pending: !hasServices },
    calendar: { title: "Calendário", icon: CalendarIcon },
    appointments: { title: "Atendimentos", icon: CircleCheckIcon },
    stock: { title: "Estoque", icon: PackageIcon },
    team: { title: "Equipe", icon: UsersIcon },
    cash_flow: { title: "Caixa", icon: WalletIcon },
  }
  const items = pages.map((page) => ({ ...tabs[page], href: `${base}${UNIT_PAGE_PATHS[page]}`, tour: `unit-tab-${page}` }))

  return (
    <nav data-tour="unit-tabs" className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto bg-background px-4 pt-2 overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        // Abas com subpáginas (ex.: a lista do calendário) seguem ativas nelas.
        const isActive = pathname === item.href || (item.href !== base && pathname.startsWith(`${item.href}/`))
        return (
          <Link
            key={item.href}
            data-tour={item.tour}
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
            {item.pending && (
              <span className="size-1.5 rounded-full bg-primary">
                <span className="sr-only">(pendente)</span>
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// Aviso da unidade sem serviços, fora da própria aba Serviços (lá o vazio já orienta).
export function ServicesSetupNotice({
  workspaceId,
  unitId,
  canManage,
}: {
  workspaceId: string
  unitId: string
  canManage: boolean
}) {
  const pathname = usePathname()
  const href = `/workspace/${workspaceId}/unit/${unitId}/services`
  if (pathname === href) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
        <LeafIcon />
      </span>
      <div className="grid min-w-0 flex-1 basis-60">
        <span className="font-medium">
          {canManage ? "Comece cadastrando os serviços" : "Unidade sem serviços cadastrados"}
        </span>
        <span className="text-sm text-muted-foreground">
          Agendamentos, atendimentos e caixa dependem dos serviços da unidade, com valor e duração.
        </span>
      </div>
      {canManage && (
        <Button size="sm" nativeButton={false} render={<Link href={href} />}>
          Cadastrar serviços
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  )
}
