"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import {
  MapPinIcon,
  CalendarIcon,
  HomeIcon,
  ArchiveIcon,
  ContactIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { WORKSPACE_PAGE_PATHS, type WorkspacePage } from "@/service/workspace/[workspaceId]/page-access"

// tour: marca do item para o tutorial destacá-lo.
type NavItem = { title: string; href: string; icon: LucideIcon; tour: string }

// Itens com subpáginas (ex.: a lista do calendário) seguem ativos nelas; o Início só na própria página.
export function isNavItemActive(pathname: string, href: string, base: string) {
  return pathname === href || (href !== base && pathname.startsWith(`${href}/`))
}

// pages: páginas do sistema liberadas para a role do usuário.
export function NavMain({ workspaceId, pages }: { workspaceId: string; pages: WorkspacePage[] }) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}`
  const item = (page: WorkspacePage, title: string, icon: LucideIcon) =>
    pages.includes(page) ? [{ title, href: `${base}${WORKSPACE_PAGE_PATHS[page]}`, icon, tour: `nav-${page}` }] : []
  const groups: { label?: string; items: NavItem[] }[] = [
    { items: item("home", "Início", HomeIcon) },
    {
      label: "Geral",
      items: [
        ...item("units", "Unidades", MapPinIcon),
        ...item("calendar", "Agenda", CalendarIcon),
        ...item("customers", "Clientes", ContactIcon),
        ...item("cash_flow", "Caixa", WalletIcon),
        ...item("stock", "Estoque", ArchiveIcon),
      ],
    },
    { label: "Configurações", items: item("users", "Usuários", UsersIcon) },
  ]

  return groups.filter((group) => group.items.length > 0).map((group, i) => (
    <SidebarGroup key={group.label ?? i}>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              data-tour={item.tour}
              tooltip={item.title}
              isActive={isNavItemActive(pathname, item.href, base)}
              render={<Link href={item.href} />}
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  ))
}
