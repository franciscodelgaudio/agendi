import { notFound } from "next/navigation"
import { ageniaProviders } from "@/lib/agenia-model"
import { availableAgeniaModels, resolveAgeniaModel } from "@/lib/agenia-models"
import { parseCostQuery } from "@/lib/ai-usage"
import { loadAiCosts } from "@/lib/ai-usage-store"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { AgeniaModelSelect } from "@/components/ai-costs/agenia-model-select"
import { AiCostsView } from "@/components/ai-costs/ai-costs-view"
import { Workspace } from "@/models/Workspace"

// Quanto o workspace gastou com os modelos de IA (AgenIA), para o proprietário e administradores.
export default async function AiCostsPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/ai-costs">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = await findWorkspaceAccess(workspaceId, user.id)
  if (!access || !can(access.actor, "agenia.use")) notFound()

  const query = parseCostQuery(await searchParams, new Date())
  const [costs, workspace] = await Promise.all([
    loadAiCosts(workspaceId, query),
    Workspace.findById(workspaceId).select({ ageniaModel: 1 }).lean(),
  ])
  const providers = ageniaProviders()
  const model = resolveAgeniaModel(workspace?.ageniaModel, providers)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Custos de IA</h2>
        <AgeniaModelSelect workspaceId={workspaceId} models={availableAgeniaModels(providers)} value={model?.id ?? null} />
      </div>
      <AiCostsView costs={costs} query={query} pathname={`/workspace/${workspaceId}/ai-costs`} />
    </div>
  )
}
