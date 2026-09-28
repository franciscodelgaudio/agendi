import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { NavigationProgressBar, NavigationProgressProvider } from "@/components/navigation-progress"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspacePaywall } from "@/components/workspace-paywall"
import { hasActiveSubscription } from "@/lib/billing"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Workspace } from "@/models/Workspace"

// O layout espera o workspace antes de renderizar: ao abrir a página inteira, a espera cai no
// loading.tsx da raiz (tela do agenli). Na navegação interna ele não recarrega, e as páginas
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

  const [workspace] = await Workspace.aggregate<{
    name: string
    role: string
    subscription: { status: string; currentPeriodEnd: Date } | null
  }>([...access, { $project: { _id: 0, name: 1, role: 1, subscription: 1 } }])
  if (!workspace) notFound()

  if (!hasActiveSubscription(workspace.subscription, new Date())) {
    return <WorkspacePaywall workspaceId={workspaceId} name={workspace.name} isOwner={workspace.role === "owner"} />
  }

  // Mesmo cookie que o SidebarProvider grava ao abrir/fechar.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <NavigationProgressProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        {sidebar}
        <SidebarInset>
          <SidebarTrigger className="fixed bottom-4 left-4 z-20 bg-background shadow-sm md:hidden" />
          <NavigationProgressBar />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </NavigationProgressProvider>
  )
}

