"use client"

import Link from "@/components/link"
import { usePathname } from "next/navigation"
import {
  MapPinIcon,
  CalendarIcon,
  HomeIcon,
  MessagesSquareIcon,
  RadioTowerIcon,
  UsersIcon,
  UsersRoundIcon,
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
import { WORKSPACE_PAGE_PATHS, type WorkspacePage } from "@/lib/page-access"

type NavItem = { title: string; href: string; icon: LucideIcon }

// pages: páginas do sistema liberadas para a função do usuário; Canais é só de
// quem gerencia. inbox: a função atende clientes pelas Conversas.
export function NavMain({
  workspaceId,
  pages,
  canManage,
  inbox,
}: {
  workspaceId: string
  pages: WorkspacePage[]
  canManage: boolean
  inbox: boolean
}) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}`
  const item = (page: WorkspacePage, title: string, icon: LucideIcon) =>
    pages.includes(page) ? [{ title, href: `${base}${WORKSPACE_PAGE_PATHS[page]}`, icon }] : []
  const groups: { label?: string; items: NavItem[] }[] = [
    { items: item("home", "Início", HomeIcon) },
    {
      label: "Geral",
      items: [
        ...item("units", "Unidades", MapPinIcon),
        ...item("calendar", "Calendário", CalendarIcon),
        ...item("cash_flow", "Caixa", WalletIcon),
        ...item("team", "Equipe", UsersRoundIcon),
        ...(inbox ? [{ title: "Conversas", href: `${base}/inbox`, icon: MessagesSquareIcon }] : []),
      ],
    },
    {
      label: "Configurações",
      items: [
        ...item("users", "Usuários", UsersIcon),
        ...(canManage
          ? [
              { title: "Canais", href: `${base}/channels`, icon: RadioTowerIcon },
            ]
          : []),
      ],
    },
  ]

  return groups.filter((group) => group.items.length > 0).map((group, i) => (
    <SidebarGroup key={group.label ?? i}>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              tooltip={item.title}
              // Itens com subpáginas (ex.: a lista do calendário) seguem ativos nelas.
              isActive={pathname === item.href || (item.href !== base && pathname.startsWith(`${item.href}/`))}
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
