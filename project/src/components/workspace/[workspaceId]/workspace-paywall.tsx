import { PlansSection } from "@/components/shared/landing/plans-section"
import { SignedInAs } from "@/components/shared/signed-in-as"

// Workspace sem assinatura ativa: administradores escolhem o plano; os demais membros só veem o aviso.
export function WorkspacePaywall({
  workspaceId,
  name,
  isAdmin,
  email,
}: {
  workspaceId: string
  name: string
  isAdmin: boolean
  email?: string | null
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ld-paper p-6 text-ld-ink md:p-10">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <SignedInAs email={email} />
          </div>
          <p className="text-ld-ink-soft">
            {isAdmin
              ? "Escolha um plano para liberar o acesso ao workspace."
              : "O acesso a este workspace está suspenso até um administrador pagar o plano."}
          </p>
        </div>
        {isAdmin && <PlansSection workspaceId={workspaceId} />}
      </div>
    </div>
  )
}
