import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RevenueShareFields } from "@/components/revenue-share-fields"
import { UnitTeamFields } from "@/components/unit-team-fields"
import { ImageUploadField } from "@/components/image-upload-field"
import { TreatmentRoomFields, type TreatmentRoomOption } from "@/components/treatment-room-fields"
import type { RevenueShare } from "@/lib/revenue-share"
import type { TeamCandidate } from "@/lib/unit-team"

// Massagistas e recepcionistas do workspace para escolher quem trabalha na unidade.
export type UnitTeamOptions = { candidates: TeamCandidate[]; canLinkTherapists: boolean }

type Props = {
  idPrefix: string
  workspaceId: string
  defaultValues?: {
    id: string
    name: string
    avatarUrl: string | null
    revenueShare: RevenueShare | null
    treatmentRooms: TreatmentRoomOption[]
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
      <TreatmentRoomFields idPrefix={idPrefix} defaultValue={defaultValues?.treatmentRooms} />
      <UnitTeamFields
        idPrefix={idPrefix}
        team={team.candidates}
        unitId={defaultValues?.id}
        canLinkTherapists={team.canLinkTherapists}
      />
      <RevenueShareFields idPrefix={idPrefix} defaultValue={defaultValues?.revenueShare} />
    </>
  )
}
