import { redirect } from "next/navigation"
import { loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"

export default async function UnitStatementsPage({ params }: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/statements">) {
  const { workspaceId, unitId } = await params
  const { partner } = await loadUnitCashFlow(workspaceId, unitId)
  redirect(partner ? `/workspace/${workspaceId}/partners/${partner.id}` : `/workspace/${workspaceId}/unit/${unitId}/cash-flow`)
}
