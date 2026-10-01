import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { AGENIA_PROVIDER_KEYS, configuredProviders, resolveAgeniaModel, type AgeniaModelOption } from "@/service/workspace/[workspaceId]/agenia/agenia-models"
import { Workspace } from "@/models/Workspace"

export const NOT_CONFIGURED_MESSAGE = `A AgenIA não está configurada: defina ${Object.values(AGENIA_PROVIDER_KEYS).join(" ou ")} no ambiente.`

export const ageniaProviders = () => configuredProviders(process.env)

function languageModel({ provider, model }: AgeniaModelOption) {
  if (provider === "groq") return createGroq({ apiKey: process.env.GROQ_API_KEY })(model)
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(model)
}

// Modelo escolhido na tela de custos; null quando nenhum provedor tem chave.
export async function loadAgeniaModel(workspaceId: string) {
  const workspace = await Workspace.findById(workspaceId).select({ ageniaModel: 1 }).lean()
  const choice = resolveAgeniaModel(workspace?.ageniaModel, ageniaProviders())
  return choice && { name: choice.model, model: languageModel(choice) }
}
