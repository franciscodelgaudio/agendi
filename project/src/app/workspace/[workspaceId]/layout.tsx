import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AgeniaProvider } from "@/components/workspace/[workspaceId]/agenia/agenia-provider"
import { NavigationProgressBar, NavigationProgressProvider } from "@/components/shared/navigation-progress"
import { TourProvider } from "@/components/workspace/[workspaceId]/tour/tour"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspacePaywall } from "@/components/workspace/[workspaceId]/workspace-paywall"
import { hasActiveSubscription } from "@/service/subscribe/billing"
import { visiblePages } from "@/service/workspace/[workspaceId]/page-access"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { User } from "@/models/User"
import { Workspace } from "@/models/Workspace"

// O layout espera o workspace antes de renderizar: ao abrir a página inteira, a espera cai no
// loading.tsx da raiz (tela do agendi). Na navegação interna ele não recarrega, e as páginas
// mostram seus skeletons dentro da moldura.
export default async function WorkspaceLayout({
  children,
  sidebar,
  params,
}: LayoutProps<"/workspace/[workspaceId]">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = workspaceAccessStages(workspaceId, user.id, { allowUnpaid: true })
  if (!access) notFound()

  const [[workspace], tutorial] = await Promise.all([
    Workspace.aggregate<{
      name: string
      actor: Actor
      subscription: { status: string; currentPeriodEnd: Date } | null
    }>([
      ...access,
      { $project: { _id: 0, name: 1, actor: 1, subscription: 1 } },
    ]),
    User.findById(user.id).select({ _id: 0, tutorialCompletedAt: 1 }).lean(),
  ])
  if (!workspace) notFound()

  if (!hasActiveSubscription(workspace.subscription, new Date())) {
    return <WorkspacePaywall workspaceId={workspaceId} name={workspace.name} isAdmin={workspace.actor.admin} email={user.email} />
  }

  // Mesmo cookie que o SidebarProvider grava ao abrir/fechar.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <NavigationProgressProvider>
      <AgeniaProvider workspaceId={workspaceId} enabled={can(workspace.actor, "agenia.use")}>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* Dentro do SidebarProvider: no celular o tutorial abre a sidebar nos passos dela. */}
        <TourProvider
          workspaceId={workspaceId}
          access={{ actor: workspace.actor, pages: visiblePages(workspace.actor) }}
          autoStart={!tutorial?.tutorialCompletedAt}
        >
          {sidebar}
          <SidebarInset>
            <SidebarTrigger className="fixed bottom-4 left-4 z-20 bg-background shadow-sm md:hidden" />
            <NavigationProgressBar />
            {children}
          </SidebarInset>
        </TourProvider>
      </SidebarProvider>
      </AgeniaProvider>
    </NavigationProgressProvider>
  )
}

