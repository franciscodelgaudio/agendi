"use client"

import Link from "@/components/shared/link"
import { usePathname } from "next/navigation"
import {
  ArchiveIcon,
  CalendarIcon,
  ContactIcon,
  HandshakeIcon,
  HomeIcon,
  LeafIcon,
  MapPinIcon,
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
  useSidebar,
} from "@/components/ui/sidebar"
import { UnitSwitcher, type SidebarUnit } from "@/components/workspace/[workspaceId]/@sidebar/unit-switcher"
import type { RolePages } from "@/service/workspace/[workspaceId]/page-access"
import {
  sectionHref,
  sectionOf,
  selectedUnitId,
  type NavSection,
} from "@/service/workspace/[workspaceId]/unit-context"

type NavItem = { section: NavSection; title: string; icon: LucideIcon }

const GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ section: "inicio", title: "Início", icon: HomeIcon }] },
  {
    label: "Atendimento",
    items: [
      { section: "agenda", title: "Agenda", icon: CalendarIcon },
      { section: "clientes", title: "Clientes", icon: ContactIcon },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { section: "caixa", title: "Caixa", icon: WalletIcon },
      { section: "parceiros", title: "Parceiros", icon: HandshakeIcon },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { section: "servicos", title: "Serviços", icon: LeafIcon },
      { section: "estoque", title: "Estoque", icon: ArchiveIcon },
    ],
  },
  {
    label: "Configurações",
    items: [
      { section: "unidades", title: "Unidades", icon: MapPinIcon },
      { section: "usuarios", title: "Usuários", icon: UsersIcon },
    ],
  },
]

export function canSee(section: NavSection, pages: RolePages, inUnit: boolean) {
  const { workspace, unit } = pages
  switch (section) {
    case "inicio":
      return inUnit ? unit.includes("overview") : workspace.includes("home")
    case "agenda":
      return inUnit ? unit.includes("calendar") : workspace.includes("calendar")
    case "caixa":
      return inUnit ? unit.includes("cash_flow") : workspace.includes("cash_flow")
    case "servicos":
      return inUnit && unit.includes("services")
    case "clientes":
      return workspace.includes("customers")
    case "parceiros":
      return workspace.includes("cash_flow")
    case "estoque":
      return workspace.includes("stock")
    case "unidades":
      return workspace.includes("units")
    case "usuarios":
      return workspace.includes("users")
  }
}

type Props = {
  workspaceId: string
  pages: RolePages
  units: SidebarUnit[]
  savedUnitId: string | null
  canCreateUnit: boolean
}

export function NavMain({ workspaceId, pages, units, savedUnitId, canCreateUnit }: Props) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const base = `/workspace/${workspaceId}`
  const unitId = selectedUnitId(
    pathname,
    base,
    savedUnitId,
    units.map((unit) => unit.id),
  )
  const selected = units.find((unit) => unit.id === unitId) ?? null
  const current = sectionOf(pathname, base)

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      const href = canSee(item.section, pages, !!selected) && sectionHref(item.section, base, selected)
      return href ? [{ ...item, href }] : []
    }),
  }))

  return (
    <>
      {units.length > 0 && (
        <UnitSwitcher workspaceId={workspaceId} units={units} selected={selected} canCreate={canCreateUnit} />
      )}
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <SidebarGroup key={group.label ?? "main"}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={current === item.section}
                    render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
    </>
  )
}
