import { notFound } from "next/navigation"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { AgeniaFullPage } from "@/components/agenia/agenia-full-page"

// A AgenIA global mexe em todo o workspace: só o proprietário e administradores.
export default async function AgeniaPage({ params }: PageProps<"/workspace/[workspaceId]/agenia">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const access = await findWorkspaceAccess(workspaceId, user.id)
  if (!access || !can(access.actor, "agenia.use")) notFound()

  return <AgeniaFullPage />
}
