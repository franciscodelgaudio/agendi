"use client"

import Link from "@/components/link"
import { usePathname } from "next/navigation"
import {
  MapPinIcon,
  CalendarIcon,
  CoinsIcon,
  HomeIcon,
  LifeBuoyIcon,
  MessagesSquareIcon,
  RadioTowerIcon,
  SparklesIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  WorkflowIcon,
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
import { useAgenia } from "@/components/agenia/agenia-provider"

// tour: marca do item para o tutorial destacá-lo.
type NavItem = { title: string; href: string; icon: LucideIcon; tour: string }

// pages: páginas do sistema liberadas para a função do usuário; Canais e URAs são só de
// quem gerencia. inbox: a função atende clientes pelas Conversas. Tickets é de todos.
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
  const agenia = useAgenia()
  const base = `/workspace/${workspaceId}`
  const item = (page: WorkspacePage, title: string, icon: LucideIcon) =>
    pages.includes(page) ? [{ title, href: `${base}${WORKSPACE_PAGE_PATHS[page]}`, icon, tour: `nav-${page}` }] : []
  const groups: { label?: string; items: NavItem[] }[] = [
    { items: item("home", "Início", HomeIcon) },
    {
      label: "Geral",
      items: [
        ...item("units", "Unidades", MapPinIcon),
        ...item("calendar", "Calendário", CalendarIcon),
        ...item("cash_flow", "Caixa", WalletIcon),
        ...item("team", "Equipe", UsersRoundIcon),
        ...(inbox ? [{ title: "Conversas", href: `${base}/inbox`, icon: MessagesSquareIcon, tour: "nav-inbox" }] : []),
      ],
    },
    {
      label: "Configurações",
      items: [
        ...item("users", "Usuários", UsersIcon),
        ...(canManage
          ? [
              { title: "Canais", href: `${base}/channels`, icon: RadioTowerIcon, tour: "nav-channels" },
              { title: "URAs", href: `${base}/uras`, icon: WorkflowIcon, tour: "nav-uras" },
              { title: "Custos de IA", href: `${base}/ai-costs`, icon: CoinsIcon, tour: "nav-ai-costs" },
            ]
          : []),
        { title: "Tickets", href: `${base}/tickets`, icon: LifeBuoyIcon, tour: "nav-tickets" },
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
              data-tour={item.tour}
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
        {/* A AgenIA abre como painel lateral; fica no primeiro grupo, junto do Início. */}
        {i === 0 && agenia && (
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="AgenIA"
              isActive={agenia.open || pathname === agenia.pageHref}
              onClick={() => agenia.setOpen(!agenia.open)}
            >
              <SparklesIcon />
              <span>AgenIA</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  ))
}
