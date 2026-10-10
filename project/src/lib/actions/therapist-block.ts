"use server"

import { isObjectIdOrHexString } from "mongoose"
import { forbiddenMessage, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { getSessionUserId } from "@/service/(auth)/session"
import { conflictChecker } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-store"
import { findWorkspaceTherapists } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { findManagedWorkspace } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createTherapistBlock,
  deleteTherapistBlock,
  type TherapistBlockError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/therapist-block"
import { TherapistBlock } from "@/models/TherapistBlock"
import { Unit } from "@/models/Unit"

const errorMessages: Record<TherapistBlockError | "workspace_not_found" | "unauthenticated", string> = {
  invalid_input: "Preencha profissional, início e fim.",
  invalid_therapist: "Escolha o profissional.",
  invalid_start: "Informe um início válido.",
  invalid_end: "Informe um fim válido.",
  invalid_block_period: "O fim precisa ser depois do início.",
  block_too_long: "A agenda pode ser travada por no máximo 31 dias de uma vez.",
  reason_too_long: "O motivo pode ter no máximo 120 caracteres.",
  therapist_not_found: "O profissional escolhido não pode atender neste workspace. Recarregue a página.",
  therapist_has_bookings: "O profissional tem agendamentos nesse período. Remarque-os antes de travar a agenda.",
  block_not_found: "Trava não encontrada ou sem permissão.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type TherapistBlockActionState = { error: string | null }

function accessError(error: AccessError): TherapistBlockActionState {
  return { error: error === "forbidden" ? forbiddenMessage("bookings.manage") : errorMessages[error] }
}

// Travar a agenda usa a mesma permissão de gerenciar agendamentos.
export async function createTherapistBlockAction(
  workspaceId: string,
  _prev: TherapistBlockActionState,
  formData: FormData,
): Promise<TherapistBlockActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const managed = await findManagedWorkspace(workspaceId, userId, "bookings.manage")
  if (!managed.ok) return accessError(managed.error)
  const { id } = managed.access
  const unitIds = await Unit.find({ workspaceId: id }).distinct("_id")

  const result = await createTherapistBlock(
    {
      therapistId: formData.get("therapistId"),
      startDay: formData.get("startDay"),
      endDay: formData.get("endDay"),
      allDay: formData.get("allDay"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      reason: formData.get("reason"),
    },
    {
      findTherapist: async (therapistId) => (await findWorkspaceTherapists(id, [therapistId]))[0] ?? null,
      hasBookings: conflictChecker(unitIds),
      insert: async (data) => {
        const block = await TherapistBlock.create({ ...data, workspaceId: id, createdBy: userId })
        return { id: block._id.toString() }
      },
    },
  )

  return { error: result.ok ? null : errorMessages[result.error] }
}

export async function deleteTherapistBlockAction(workspaceId: string, blockId: string): Promise<TherapistBlockActionState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const managed = await findManagedWorkspace(workspaceId, userId, "bookings.manage")
  if (!managed.ok) return accessError(managed.error)
  const { id } = managed.access

  const result = await deleteTherapistBlock(isObjectIdOrHexString(blockId) ? blockId : null, async (block) => {
    const { deletedCount } = await TherapistBlock.deleteOne({ _id: block, workspaceId: id })
    return deletedCount > 0
  })

  return { error: result.ok ? null : errorMessages[result.error] }
}
