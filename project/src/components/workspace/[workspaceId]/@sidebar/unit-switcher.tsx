"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { switchUnitHref, unitCookieName, unitFromPath } from "@/service/workspace/[workspaceId]/unit-context"

export type SidebarUnit = { id: string; name: string; imageUrl: string | null; inventoryId: string | null }

const YEAR_SECONDS = 60 * 60 * 24 * 365

function saveUnit(workspaceId: string, unitId: string | null) {
  document.cookie = unitId
    ? `${unitCookieName(workspaceId)}=${unitId}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`
    : `${unitCookieName(workspaceId)}=; path=/; max-age=0; samesite=lax`
}

function UnitMark({ unit, className }: { unit: SidebarUnit | null; className?: string }) {
  if (!unit) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center bg-sidebar-accent text-sidebar-accent-foreground">
        <LayoutGridIcon className="size-4" />
      </span>
    )
  }
  return (
    <Avatar className={className ?? "size-8 rounded-none after:rounded-none"}>
      {unit.imageUrl && <AvatarImage src={unit.imageUrl} alt={unit.name} className="rounded-none object-cover" />}
      <InitialFallback name={unit.name} className="rounded-none" />
    </Avatar>
  )
}

type Props = {
  workspaceId: string
  units: SidebarUnit[]
  selected: SidebarUnit | null
  canCreate: boolean
}

export function UnitSwitcher({ workspaceId, units, selected, canCreate }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const base = `/workspace/${workspaceId}`
  const pathUnit = unitFromPath(pathname, base)

  useEffect(() => {
    if (pathUnit) saveUnit(workspaceId, pathUnit)
  }, [workspaceId, pathUnit])

  function pick(unit: SidebarUnit | null) {
    saveUnit(workspaceId, unit?.id ?? null)
    setOpenMobile(false)
    router.push(switchUnitHref(pathname, base, unit))
    router.refresh()
  }

  return (
    <SidebarGroup className="py-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  tooltip={selected?.name ?? "Todas as unidades"}
                  className="border bg-background data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                />
              }
            >
              <UnitMark unit={selected} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs text-muted-foreground">Unidade</span>
                <span className="truncate font-medium">{selected?.name ?? "Todas as unidades"}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-(--anchor-width) min-w-60" side={isMobile ? "bottom" : "right"} align="start">
              <DropdownMenuItem onClick={() => pick(null)}>
                <LayoutGridIcon />
                <div className="grid flex-1 leading-tight">
                  <span className="font-medium">Todas as unidades</span>
                  <span className="text-xs text-muted-foreground">Panorama do negócio</span>
                </div>
                {!selected && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
              {units.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Unidades</DropdownMenuLabel>
                    {units.map((unit) => (
                      <DropdownMenuItem key={unit.id} onClick={() => pick(unit)}>
                        <UnitMark unit={unit} className="size-6 rounded-none after:rounded-none" />
                        <span className="truncate">{unit.name}</span>
                        {selected?.id === unit.id && <CheckIcon className="ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              {canCreate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href={`${base}/unit/new`} />} onClick={() => setOpenMobile(false)}>
                    <PlusIcon />
                    Nova unidade
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
