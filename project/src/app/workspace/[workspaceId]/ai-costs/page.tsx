import { notFound } from "next/navigation"
import { parseCostQuery } from "@/lib/ai-usage"
import { loadAiCosts } from "@/lib/ai-usage-store"
import { canManageMembers } from "@/lib/member-role"
import { requireUser } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { AiCostsView } from "@/components/ai-costs/ai-costs-view"

// Quanto o workspace gastou com os modelos de IA (AgenIA), para o proprietário e administradores.
export default async function AiCostsPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/ai-costs">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = await findWorkspaceAccess(workspaceId, user.id)
  if (!access || !canManageMembers(access.role)) notFound()

  const query = parseCostQuery(await searchParams, new Date())
  const costs = await loadAiCosts(workspaceId, query)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Custos de IA</h2>
      <AiCostsView costs={costs} query={query} pathname={`/workspace/${workspaceId}/ai-costs`} />
    </div>
  )
}
