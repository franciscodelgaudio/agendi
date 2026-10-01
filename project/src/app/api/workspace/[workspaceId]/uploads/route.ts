import { can } from "@/lib/permissions"
import { uploadImage, type UploadImageError } from "@/lib/image-upload"
import { missingR2Env, r2UploadDeps } from "@/lib/r2-storage"
import { getSessionUserId } from "@/lib/session"
import { findManagedUnit } from "@/lib/unit-access"
import { findWorkspaceAccess } from "@/lib/workspace-access"

const errorMessages: Record<UploadImageError, string> = {
  missing_file: "Escolha uma imagem.",
  invalid_type: "Envie uma imagem JPG, PNG ou WebP.",
  too_large: "A imagem pode ter no máximo 5 MB.",
  upload_failed: "Não foi possível enviar a imagem. Tente novamente.",
}

// Pasta no bucket, conferindo a permissão de quem envia: imagem do workspace exige editar o
// workspace; de unidade, gerenciar unidades; de nó de mídia, gerenciar URAs; de produto,
// gerenciar o estoque da unidade dele. null = sem permissão.
async function resolveFolder(workspaceId: string, userId: string, target: FormDataEntryValue | null, unitId: FormDataEntryValue | null) {
  if (target === "workspace" || target === "unit" || target === "ura") {
    const access = await findWorkspaceAccess(workspaceId, userId)
    const permission = target === "ura" ? "uras.manage" : target === "unit" ? "units.manage" : "workspace.manage"
    if (!access || !can(access.actor, permission)) return null
    if (target === "ura") return `workspaces/${access.id}/uras`
    return target === "unit" ? `workspaces/${access.id}/units` : `workspaces/${access.id}`
  }
  if (target === "product" && typeof unitId === "string") {
    const unit = await findManagedUnit(workspaceId, unitId, userId, "stock.manage")
    return unit ? `workspaces/${unit.workspaceId}/units/${unit.unitId}/products` : null
  }
  return null
}

// Recebe a imagem (multipart: file, target=workspace|unit|ura|product, unitId) e devolve a URL pública no R2.
// A URL volta para o formulário, que a salva no campo avatarUrl.
export async function POST(request: Request, { params }: RouteContext<"/api/workspace/[workspaceId]/uploads">) {
  const { workspaceId } = await params
  const userId = await getSessionUserId()
  if (!userId) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 })

  const missing = missingR2Env()
  if (missing.length) {
    console.error(`Upload de imagem indisponível; faltam variáveis: ${missing.join(", ")}`)
    return Response.json({ error: "Envio de imagens indisponível no momento." }, { status: 503 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) return Response.json({ error: errorMessages.missing_file }, { status: 400 })

  const folder = await resolveFolder(workspaceId, userId, formData.get("target"), formData.get("unitId"))
  if (!folder) return Response.json({ error: "Sem permissão para enviar esta imagem." }, { status: 403 })

  const result = await uploadImage(formData.get("file"), folder, r2UploadDeps())
  if (!result.ok) {
    return Response.json({ error: errorMessages[result.error] }, { status: result.error === "upload_failed" ? 502 : 400 })
  }
  return Response.json({ url: result.url })
}
