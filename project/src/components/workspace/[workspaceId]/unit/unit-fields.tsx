import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RevenueShareFields } from "@/components/workspace/[workspaceId]/unit/revenue-share-fields"
import { UnitTeamFields } from "@/components/workspace/[workspaceId]/unit/unit-team-fields"
import { ImageUploadField } from "@/components/shared/image-upload-field"
import { BusinessHoursFields } from "@/components/workspace/[workspaceId]/unit/business-hours-fields"
import { TreatmentRoomFields, type TreatmentRoomOption } from "@/components/workspace/[workspaceId]/unit/treatment-room-fields"
import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"
import type { TeamCandidate } from "@/service/workspace/[workspaceId]/team/unit-team"

// Membros do workspace (menos administradores) para escolher quem trabalha na unidade.
// canEdit: permissão de gerenciar a equipe; sem ela o campo nem aparece e a equipe fica como está.
export type UnitTeamOptions = { candidates: TeamCandidate[]; canEdit: boolean }

type Props = {
  idPrefix: string
  workspaceId: string
  defaultValues?: {
    id: string
    name: string
    avatarUrl: string | null
    revenueShare: RevenueShare | null
    treatmentRooms: TreatmentRoomOption[]
    businessHours: BusinessHours
  }
  team: UnitTeamOptions
}

export function UnitFields({ idPrefix, workspaceId, defaultValues, team }: Props) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Unidade Centro"
          defaultValue={defaultValues?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <ImageUploadField
        id={`${idPrefix}-image`}
        label="Imagem (opcional)"
        workspaceId={workspaceId}
        target="unit"
        defaultValue={defaultValues?.avatarUrl}
      />
      <BusinessHoursFields idPrefix={idPrefix} defaultValue={defaultValues?.businessHours} />
      <TreatmentRoomFields idPrefix={idPrefix} defaultValue={defaultValues?.treatmentRooms} />
      {team.canEdit && <UnitTeamFields idPrefix={idPrefix} team={team.candidates} unitId={defaultValues?.id} />}
      <RevenueShareFields idPrefix={idPrefix} defaultValue={defaultValues?.revenueShare} />
    </>
  )
}
