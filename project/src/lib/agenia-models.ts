// Modelos que a AgenIA pode usar; sem dependências de servidor, a tela de custos também importa.
export type AgeniaProvider = "google" | "groq"

export type AgeniaModelOption = { id: string; provider: AgeniaProvider; model: string; label: string }

const option = (provider: AgeniaProvider, model: string, label: string): AgeniaModelOption => ({
  id: `${provider}:${model}`,
  provider,
  model,
  label,
})

// O primeiro disponível é o padrão.
export const AGENIA_MODELS: AgeniaModelOption[] = [
  option("google", "gemini-flash-lite-latest", "Gemini Flash-Lite"),
  option("google", "gemini-flash-latest", "Gemini Flash"),
  option("groq", "openai/gpt-oss-120b", "GPT-OSS 120B (Groq)"),
  option("groq", "openai/gpt-oss-20b", "GPT-OSS 20B (Groq)"),
  option("groq", "qwen/qwen3.8-27b", "Qwen 3.8 27B (Groq)"),
]

export const AGENIA_PROVIDER_KEYS: Record<AgeniaProvider, string> = {
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
}

export function configuredProviders(env: Record<string, string | undefined>): AgeniaProvider[] {
  return (Object.keys(AGENIA_PROVIDER_KEYS) as AgeniaProvider[]).filter((provider) => env[AGENIA_PROVIDER_KEYS[provider]]?.trim())
}

export const availableAgeniaModels = (providers: AgeniaProvider[]) => AGENIA_MODELS.filter((m) => providers.includes(m.provider))

export function resolveAgeniaModel(saved: string | null | undefined, providers: AgeniaProvider[]) {
  const available = availableAgeniaModels(providers)
  return available.find((m) => m.id === saved) ?? available[0] ?? null
}

export type UpdateAgeniaModelError = "invalid_model" | "provider_not_configured" | "workspace_not_found"

export async function updateAgeniaModel(
  input: unknown,
  workspaceId: string | null | undefined,
  providers: AgeniaProvider[],
  update: (workspaceId: string, modelId: string) => Promise<boolean>,
): Promise<{ ok: true } | { ok: false; error: UpdateAgeniaModelError }> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" }
  const choice = AGENIA_MODELS.find((m) => m.id === input)
  if (!choice) return { ok: false, error: "invalid_model" }
  if (!providers.includes(choice.provider)) return { ok: false, error: "provider_not_configured" }
  return (await update(workspaceId, choice.id)) ? { ok: true } : { ok: false, error: "workspace_not_found" }
}
