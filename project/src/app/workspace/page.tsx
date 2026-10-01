import { redirect } from "next/navigation"
import { Types } from "mongoose"
import { PlansSection } from "@/components/shared/landing/plans-section"
import { SignedInAs } from "@/components/shared/signed-in-as"
import { requireUser } from "@/service/(auth)/session"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

// "/workspace" é o destino padrão após login e cadastro: manda para o workspace do
// usuário ou, sem nenhum, para a escolha do plano. O primeiro workspace só nasce pelo
// webhook do pagamento.
export default async function Home() {
  const user = await requireUser()

  // O workspace mais antigo em que é membro com acesso (administrador ou com role) é o padrão.
  const userId = new Types.ObjectId(user.id)
  const memberOf = await WorkspaceMember.distinct("workspaceId", {
    userId,
    $or: [{ admin: true }, { roleId: { $ne: null } }],
  })
  const [workspace] = await Workspace.aggregate<{ id: string }>([
    { $match: { _id: { $in: memberOf } } },
    { $sort: { createdAt: 1 } },
    { $limit: 1 },
    { $project: { _id: 0, id: { $toString: "$_id" } } },
  ])

  if (workspace) redirect(`/workspace/${workspace.id}`)

  return (
    <div className="flex min-h-svh items-center justify-center bg-ld-paper p-6 text-ld-ink md:p-10">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Escolha um plano</h1>
          <SignedInAs email={user.email} />
        </div>
        <PlansSection />
      </div>
    </div>
  )
}
