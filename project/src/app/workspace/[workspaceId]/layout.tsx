import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { NavigationProgressBar, NavigationProgressProvider } from "@/components/shared/navigation-progress"
import { TourProvider } from "@/components/workspace/[workspaceId]/tour/tour"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { MobileNav } from "@/components/workspace/[workspaceId]/mobile-nav"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"

// O layout espera o workspace antes de renderizar: ao abrir a página inteira, a espera cai no
// loading.tsx da raiz (tela do Agendi). Na navegação interna ele não recarrega, e as páginas
// mostram seus skeletons dentro da moldura.
export default async function WorkspaceLayout({
  children,
  sidebar,
  params,
}: LayoutProps<"/workspace/[workspaceId]">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ name: string; actor: Actor }>([
    ...access,
    { $project: { _id: 0, name: 1, actor: 1 } },
  ])
  if (!workspace) notFound()

  // Mesmo cookie que o SidebarProvider grava ao abrir/fechar.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <NavigationProgressProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* Dentro do SidebarProvider: no celular o tutorial abre a sidebar nos passos dela. */}
        <TourProvider
          workspaceId={workspaceId}
          access={{ actor: workspace.actor, pages: visiblePages(workspace.actor) }}
        >
          {sidebar}
          <SidebarInset className="pb-(--bottom-nav-height)">
            <NavigationProgressBar />
            {children}
          </SidebarInset>
          <MobileNav workspaceId={workspaceId} pages={visiblePages(workspace.actor).workspace} />
        </TourProvider>
      </SidebarProvider>
    </NavigationProgressProvider>
  )
}

