import { PlansSection } from "@/components/landing/plans-section"

// Workspace sem assinatura ativa: o dono escolhe o plano; os demais membros só veem o aviso.
export function WorkspacePaywall({ workspaceId, name, isOwner }: { workspaceId: string; name: string; isOwner: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ld-paper p-6 text-ld-ink md:p-10">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-ld-ink-soft">
            {isOwner
              ? "Escolha um plano para liberar o acesso ao workspace."
              : "O acesso a este workspace está suspenso até o pagamento do plano pelo proprietário."}
          </p>
        </div>
        {isOwner && <PlansSection workspaceId={workspaceId} />}
      </div>
    </div>
  )
}
