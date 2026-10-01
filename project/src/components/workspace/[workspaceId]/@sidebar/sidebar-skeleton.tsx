import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

// Mesma estrutura da AppSidebar (workspace, grupos de navegação e usuário); no modo recolhido
// sobram só os ícones.
export function SidebarSkeleton() {
  return (
    <Sidebar collapsible="icon" aria-busy>
      <SidebarHeader>
        <SidebarRowSkeleton size="lg" />
      </SidebarHeader>
      <SidebarContent>
        {[1, 4, 3].map((items, group) => (
          <SidebarGroup key={group} className="gap-1">
            {group > 0 && <Skeleton className="mx-2 my-2 h-3 w-20 group-data-[collapsible=icon]:hidden" />}
            {Array.from({ length: items }, (_, i) => (
              <SidebarRowSkeleton key={i} />
            ))}
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarRowSkeleton size="lg" />
      </SidebarFooter>
    </Sidebar>
  )
}

function SidebarRowSkeleton({ size = "default" }: { size?: "default" | "lg" }) {
  const lg = size === "lg"
  return (
    <div className={lg ? "flex h-12 items-center gap-2 p-2" : "flex h-8 items-center gap-2 p-2"}>
      <Skeleton className={lg ? "size-8 shrink-0 rounded-lg" : "size-4 shrink-0"} />
      <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-4 w-3/4" />
        {lg && <Skeleton className="h-3 w-1/2" />}
      </div>
    </div>
  )
}
