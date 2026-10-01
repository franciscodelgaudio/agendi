import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavMain } from "@/components/workspace/[workspaceId]/@sidebar/nav-main"
import { NavUser } from "@/components/workspace/[workspaceId]/@sidebar/nav-user"
import { WorkspaceHeader } from "@/components/workspace/[workspaceId]/@sidebar/workspace-header"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"

type Props = React.ComponentProps<typeof NavUser> &
  Pick<React.ComponentProps<typeof NavMain>, "pages" | "actor"> & {
    workspace: React.ComponentProps<typeof WorkspaceHeader>["workspace"]
  }

export function AppSidebar({ workspace, pages, actor, user, logoutAction }: Props) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceHeader workspace={workspace} canManage={can(actor, "workspace.manage")} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain workspaceId={workspace.id} pages={pages} actor={actor} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} logoutAction={logoutAction} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
