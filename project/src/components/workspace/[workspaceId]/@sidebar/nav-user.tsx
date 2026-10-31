"use client"

import { useTransition } from "react"
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { userAvatarSrc } from "@/components/shared/user-avatar-src"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type Props = {
  user: { name?: string | null; email?: string | null; image?: string | null }
  logoutAction: () => Promise<void>
}

export function NavUser({ user, logoutAction }: Props) {
  const { isMobile } = useSidebar()
  const [isPending, startTransition] = useTransition()
  const name = user.name || user.email || "Usuário"

  const userInfo = (
    <>
      <Avatar className="size-8 rounded-[0.625rem] after:rounded-[0.625rem]">
        <AvatarImage src={userAvatarSrc(user, 64)} alt={name} className="rounded-[0.625rem]" />
        <InitialFallback name={name} className="rounded-[0.625rem]" />
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {userInfo}
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-foreground">
                  {userInfo}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => startTransition(() => logoutAction())}
            >
              {isPending ? <Spinner /> : <LogOutIcon />}
              {isPending ? "Saindo..." : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
