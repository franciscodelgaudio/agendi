import { notFound } from "next/navigation"
import { HandshakeIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import Link from "@/components/shared/link"
import { tiersSummary } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { CreatePartnerButton, PartnerActions, type PartnerRow } from "@/components/workspace/[workspaceId]/partners/partner-sheets"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Workspace } from "@/models/Workspace"

export default async function PartnersPage({ params }: PageProps<"/workspace/[workspaceId]/partners">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    partners: PartnerRow[]
    units: { id: string; name: string; hasPartner: boolean }[]
  }>([
    ...access,
    {
      $lookup: {
        from: "partners",
        localField: "_id",
        foreignField: "workspaceId",
        as: "partners",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          {
            $lookup: {
              from: "units",
              localField: "unitId",
              foreignField: "_id",
              as: "unit",
              pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              thresholdRule: 1,
              tiers: { $map: { input: "$tiers", in: { thresholdCents: "$$this.thresholdCents", shareBps: "$$this.shareBps" } } },
              unit: { $ifNull: [{ $first: "$unit" }, null] },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          { $lookup: { from: "partners", localField: "_id", foreignField: "unitId", as: "partner", pipeline: [{ $limit: 1 }] } },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, hasPartner: { $gt: [{ $size: "$partner" }, 0] } } },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, partners: 1, units: 1 } },
  ])
  if (!workspace) notFound()
  const { partners } = workspace
  const canManage = can(workspace.actor, "partners.manage")
  const freeUnits = workspace.units.filter((unit) => !unit.hasPartner).map(({ id, name }) => ({ id, name }))
  const base = `/workspace/${workspaceId}`

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Parceiros</h2>
          <span className="text-sm text-muted-foreground">Estabelecimentos que recebem dos clientes e repassam por período.</span>
        </div>
        {canManage && partners.length > 0 && <CreatePartnerButton workspaceId={workspaceId} units={freeUnits} />}
      </div>

      {partners.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandshakeIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum parceiro cadastrado</EmptyTitle>
            <EmptyDescription>
              Cadastre um parceiro quando uma unidade funciona no espaço de outro estabelecimento que fica com uma parte do
              faturamento.
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreatePartnerButton workspaceId={workspaceId} units={freeUnits} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="@container border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full px-4">Parceiro</TableHead>
                <TableHead className="px-4 @max-xl:hidden">Unidade</TableHead>
                <TableHead className="px-4 @max-3xl:hidden">Repasse</TableHead>
                {canManage && <TableHead className="w-0 px-4" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell className="max-w-0 px-4">
                    <span className="block truncate font-medium">{partner.name}</span>
                    <span className="block truncate text-xs text-muted-foreground @xl:hidden">
                      {partner.unit?.name ?? "Sem unidade"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 whitespace-nowrap @max-xl:hidden">
                    {partner.unit ? (
                      <Link href={`${base}/unit/${partner.unit.id}/cash-flow/statements`} className="hover:underline">
                        {partner.unit.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Sem unidade</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 whitespace-nowrap tabular-nums @max-3xl:hidden">{tiersSummary(partner)}</TableCell>
                  {canManage && (
                    <TableCell className="px-4 text-right">
                      <PartnerActions workspaceId={workspaceId} partner={partner} units={freeUnits} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
