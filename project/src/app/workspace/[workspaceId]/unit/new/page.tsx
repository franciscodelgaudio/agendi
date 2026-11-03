import { notFound, redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { unitMemberOptionsStages, unitRefOptionsStages } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
import type { MemberOption } from "@/components/workspace/[workspaceId]/unit/unit-member-fields"
import { UnitSetupWizard } from "@/components/workspace/[workspaceId]/unit/unit-setup-wizard"
import { Workspace } from "@/models/Workspace"

type Option = { id: string; name: string }

export default async function NewUnitPage({ params }: PageProps<"/workspace/[workspaceId]/unit/new">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "units" })
  if (!can(actor, "units.manage") || !can(actor, "services.manage")) redirect(`/workspace/${workspaceId}/unit`)
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ members: MemberOption[]; wallets: Option[]; inventories: Option[] }>([
    ...access,
    ...unitMemberOptionsStages(),
    ...unitRefOptionsStages(),
    { $project: { _id: 0, members: 1, wallets: 1, inventories: 1 } },
  ])
  if (!workspace) notFound()

  return (
    <UnitSetupWizard
      workspaceId={workspaceId}
      wallets={workspace.wallets}
      inventories={workspace.inventories}
      options={{ members: workspace.members }}
      canPartner={can(actor, "partners.manage")}
    />
  )
}
