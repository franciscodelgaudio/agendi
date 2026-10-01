"use client"

import { useTransition } from "react"
import { ChevronsUpDownIcon, GraduationCapIcon, LogOutIcon } from "lucide-react"
import { useTour } from "@/components/workspace/[workspaceId]/tour/tour"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const tour = useTour()
  const [isPending, startTransition] = useTransition()
  const name = user.name || user.email || "Usuário"

  const userInfo = (
    <>
      <Avatar className="size-8 rounded-[0.625rem] after:rounded-[0.625rem]">
        {user.image && <AvatarImage src={user.image} alt={name} className="rounded-[0.625rem]" />}
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
                data-tour="user-menu"
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
            {tour && tour.tours.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <GraduationCapIcon />
                  Tutoriais
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tour.tours.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => tour.start(item.id)}>
                      {item.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
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
