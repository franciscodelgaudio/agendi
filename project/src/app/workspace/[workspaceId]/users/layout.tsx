import { Suspense } from "react"
import { notFound } from "next/navigation"
import { findVisiblePages } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { UsersNav } from "@/components/workspace/[workspaceId]/users/users-nav"
import { TabsNavSkeleton } from "@/components/shared/page-skeletons"

// Título e abas de usuários (lista e permissões); cada aba verifica o acesso por conta própria.
export default async function UsersLayout({ children, params }: LayoutProps<"/workspace/[workspaceId]/users">) {
  const { workspaceId } = await params

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Usuários</h2>
      <Suspense fallback={<TabsNavSkeleton widths={["w-20", "w-24"]} />}>
        <UsersNavLoader workspaceId={workspaceId} />
      </Suspense>
      {children}
    </div>
  )
}

async function UsersNavLoader({ workspaceId }: { workspaceId: string }) {
  const user = await requireUser()
  const found = await findVisiblePages(workspaceId, user.id)
  if (!found) notFound()
  return <UsersNav workspaceId={workspaceId} canManage={found.actor.admin} />
}
